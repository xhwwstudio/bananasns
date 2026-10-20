import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiConversation, AiMessage, User } from '../../database/entities';
import { HelpersService } from '../../common/helpers.service';
import { checkSensitive } from '../../common/sensitive';
import { SendAiMessageDto } from './dto/ai.dto';

const MODELS: Record<string, string> = {
  'claude-sonnet-4-6': 'Claude Sonnet 4.6',
  'claude-opus-4-8': 'Claude Opus 4.8',
  'claude-haiku-4-5': 'Claude Haiku 4.5',
};
const DEFAULT_MODEL = 'claude-sonnet-4-6';
const SYSTEM = `你是「BananaSNS 智能助手」，一个轻社交社区里友好、克制、实用的中文 AI 助手。
你可以帮用户：润色 / 续写动态文案、想话题灵感、解答社区功能用法（圈子、投票、问答、积分、签到等）、给建议。
风格：简洁、真诚、有温度，不啰嗦，不卖弄。除非用户要求，否则不要用大量 emoji。`;

/**
 * Ported from server/src/routes/ai.js. Integrated AI assistant — conversations
 * + messages, persisted, with a demo-mode fallback when ANTHROPIC_API_KEY is
 * unset. Calls the Anthropic Messages API. Response shapes match Express.
 */
@Injectable()
export class AiService {
  constructor(
    @InjectRepository(AiConversation)
    private readonly conversations: Repository<AiConversation>,
    @InjectRepository(AiMessage)
    private readonly messages: Repository<AiMessage>,
    private readonly helpers: HelpersService,
  ) {}

  private async convOwned(
    id: number,
    uid: number,
  ): Promise<AiConversation | null> {
    return this.conversations.findOne({ where: { id, user_id: uid } });
  }

  // Call Claude via the Anthropic Messages API; demo-mode fallback when unconfigured.
  private async callClaude(
    history: { role: string; content: string }[],
    model: string,
  ): Promise<{ text: string; demo?: boolean }> {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      const last = history[history.length - 1]?.content || '';
      return {
        demo: true,
        text:
          `（演示模式）你好，我是 BananaSNS 智能助手。当前服务端未配置 ANTHROPIC_API_KEY，所以这是一条占位回复。\n\n` +
          `配置密钥后我就能真正回答「${last.slice(0, 40)}${
            last.length > 40 ? '…' : ''
          }」这类问题，并帮你润色动态、想话题、解答社区用法。`,
      };
    }
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODELS[model] ? model : DEFAULT_MODEL,
        max_tokens: 1024,
        system: SYSTEM,
        messages: history.map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    if (!resp.ok) throw new Error(`AI 服务暂时不可用（${resp.status}）`);
    const data: any = await resp.json();
    const text = (data.content || [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('')
      .trim();
    return { text: text || '（没有返回内容）' };
  }

  // ---- GET /api/ai/status ----
  status() {
    return {
      configured: !!process.env.ANTHROPIC_API_KEY,
      defaultModel: DEFAULT_MODEL,
      models: MODELS,
    };
  }

  // ---- GET /api/ai/conversations ----
  async listConversations(user: User) {
    const rows = await this.conversations.find({
      where: { user_id: user.id },
      order: { updated_at: 'DESC' },
      take: 50,
      select: ['id', 'title', 'created_at', 'updated_at'],
    });
    return { conversations: rows };
  }

  // ---- POST /api/ai/conversations ----
  async createConversation(user: User) {
    const now = this.helpers.nowSql();
    const saved = await this.conversations.save(
      this.conversations.create({
        user_id: user.id,
        title: '新对话',
        created_at: now,
        updated_at: now,
      }),
    );
    const row = await this.conversations.findOne({
      where: { id: saved.id },
      select: ['id', 'title', 'created_at', 'updated_at'],
    });
    return { conversation: row };
  }

  // ---- GET /api/ai/conversations/:id ----
  async getConversation(id: number, user: User) {
    const conv = await this.convOwned(id, user.id);
    if (!conv) throw new NotFoundException('对话不存在');
    const messages = await this.messages.find({
      where: { conversation_id: conv.id },
      order: { id: 'ASC' },
      select: ['id', 'role', 'content', 'created_at'],
    });
    return {
      conversation: { id: conv.id, title: conv.title, createdAt: conv.created_at },
      messages,
    };
  }

  // ---- DELETE /api/ai/conversations/:id ----
  async deleteConversation(id: number, user: User) {
    const conv = await this.convOwned(id, user.id);
    if (!conv) throw new NotFoundException('对话不存在');
    await this.messages.delete({ conversation_id: conv.id });
    await this.conversations.delete({ id: conv.id });
    return { ok: true };
  }

  // ---- POST /api/ai/conversations/:id/messages ----
  async sendMessage(id: number, user: User, dto: SendAiMessageDto) {
    const conv = await this.convOwned(id, user.id);
    if (!conv) throw new NotFoundException('对话不存在');
    const content = (dto.content || '').trim();
    if (!content) throw new BadRequestException('说点什么吧');
    if (content.length > 4000) throw new BadRequestException('消息太长了');
    if (checkSensitive(content))
      throw new BadRequestException('内容包含敏感信息，请修改后重试');
    const model = dto.model || DEFAULT_MODEL;

    await this.messages.insert({
      conversation_id: conv.id,
      role: 'user',
      content,
      created_at: this.helpers.nowSql(),
    });
    const count = await this.messages.count({
      where: { conversation_id: conv.id },
    });
    if (count === 1)
      await this.conversations.update(
        { id: conv.id },
        { title: content.slice(0, 24) },
      );

    const history = await this.messages.find({
      where: { conversation_id: conv.id },
      order: { id: 'ASC' },
      select: ['role', 'content'],
    });
    let reply: { text: string; demo?: boolean };
    try {
      reply = await this.callClaude(history, model);
    } catch (err: any) {
      throw new HttpException(err.message, 502);
    }
    const saved = await this.messages.save(
      this.messages.create({
        conversation_id: conv.id,
        role: 'assistant',
        content: reply.text,
        created_at: this.helpers.nowSql(),
      }),
    );
    await this.conversations.update(
      { id: conv.id },
      { updated_at: this.helpers.nowSql() },
    );
    const out = await this.messages.findOne({
      where: { id: saved.id },
      select: ['id', 'role', 'content', 'created_at'],
    });
    return { message: out, demo: !!reply.demo };
  }

  // ---- POST /api/ai/conversations/:id/messages/../stream —— SSE 流式回复 ----
  // 客户端按 `event: delta\ndata:{text}` 累积；error 用 `event: error`。
  // 校验类错误在写 SSE 头之前抛出(走正常 JSON 错误, resp.ok=false)；回复阶段错误走 event:error。
  async streamMessage(id: number, user: User, dto: SendAiMessageDto, res: any) {
    const conv = await this.convOwned(id, user.id);
    if (!conv) throw new NotFoundException('对话不存在');
    const content = (dto.content || '').trim();
    if (!content) throw new BadRequestException('说点什么吧');
    if (content.length > 4000) throw new BadRequestException('消息太长了');
    if (checkSensitive(content))
      throw new BadRequestException('内容包含敏感信息，请修改后重试');
    const model = dto.model || DEFAULT_MODEL;

    await this.messages.insert({
      conversation_id: conv.id,
      role: 'user',
      content,
      created_at: this.helpers.nowSql(),
    });
    const count = await this.messages.count({ where: { conversation_id: conv.id } });
    if (count === 1)
      await this.conversations.update({ id: conv.id }, { title: content.slice(0, 24) });
    const history = await this.messages.find({
      where: { conversation_id: conv.id },
      order: { id: 'ASC' },
      select: ['role', 'content'],
    });

    // 从这里开始写 SSE
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // 禁反代缓冲
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
    const sse = (event: string, data: any) =>
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    try {
      const reply = await this.callClaude(history, model);
      // 分块发出(每 ~28 字一块)，客户端逐步渲染出"打字"观感
      const text = reply.text || '';
      for (let i = 0; i < text.length; i += 28) sse('delta', { text: text.slice(i, i + 28) });
      await this.messages.save(
        this.messages.create({
          conversation_id: conv.id,
          role: 'assistant',
          content: text,
          created_at: this.helpers.nowSql(),
        }),
      );
      await this.conversations.update({ id: conv.id }, { updated_at: this.helpers.nowSql() });
      sse('done', { ok: true, demo: !!reply.demo });
    } catch (err: any) {
      sse('error', { error: err?.message || 'AI 回复失败' });
    } finally {
      res.end();
    }
  }
}
