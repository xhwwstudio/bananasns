import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SensitiveWordFile, SiteConfig } from '../database/entities';
import { setSensitiveConfig } from './sensitive';
import { parseSensitiveWords } from './sensitive-words';

export interface UploadedWordFile {
  originalname: string;
  buffer: Buffer;
  size?: number;
}

const MAX_FILES_PER_UPLOAD = 20;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

/**
 * 敏感词配置/词库文件缓存。
 * checkSensitive 是同步函数、被 14+ service 直接调用，不能逐处改 async；
 * 所以这里把 site_config 与启用的文件词库定期(20s)+启动时+后台写入后刷进 sensitive.ts。
 */
@Injectable()
export class SensitiveService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(SiteConfig)
    private readonly repo: Repository<SiteConfig>,
    @InjectRepository(SensitiveWordFile)
    private readonly files: Repository<SensitiveWordFile>,
  ) {}

  /** 从 site_config + 启用的词库文件读取并刷新进程内缓存。 */
  async refresh(): Promise<void> {
    const rows = await this.repo.find({
      where: { key: In(['sensitive_enabled', 'sensitive_words']) },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const enabledFiles = await this.files.find({
      where: { enabled: 1 },
      order: { id: 'ASC' },
    });
    const fileWords = enabledFiles.flatMap((f) => f.content.split('\n')).filter(Boolean);
    setSensitiveConfig(
      map.get('sensitive_enabled') ?? '1',
      map.get('sensitive_words') ?? '',
      fileWords,
    );
  }

  async listFiles(): Promise<any[]> {
    const rows = await this.files.find({
      select: ['id', 'filename', 'word_count', 'enabled', 'created_at'],
      order: { id: 'DESC' },
    });
    return rows.map((r) => ({
      id: r.id,
      filename: r.filename,
      wordCount: r.word_count,
      enabled: !!r.enabled,
      createdAt: r.created_at,
    }));
  }

  async addFiles(inputs: UploadedWordFile[]): Promise<{
    files: any[];
    skipped: { filename: string; reason: string }[];
  }> {
    if (!inputs?.length) throw new BadRequestException('请选择要上传的词库文件');
    if (inputs.length > MAX_FILES_PER_UPLOAD)
      throw new BadRequestException(`一次最多上传 ${MAX_FILES_PER_UPLOAD} 个词库文件`);

    const skipped: { filename: string; reason: string }[] = [];
    let added = 0;
    for (const f of inputs) {
      const filename = (f.originalname || '未命名.txt').split(/[\\/]/).pop()!.slice(0, 255);
      try {
        if ((f.size ?? f.buffer.length) > MAX_FILE_BYTES)
          throw new Error('文件超过 5MB');
        const words = parseSensitiveWords(f.buffer.toString('utf8'));
        if (!words.length) throw new Error('没有解析到有效词条');
        await this.files.save(
          this.files.create({
            filename,
            word_count: words.length,
            content: words.join('\n'),
            enabled: 0, // 默认停用：先让站长在队列里确认词表和数量，再手动开启
            created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
          }),
        );
        added++;
      } catch (e: any) {
        skipped.push({ filename, reason: e?.message || '解析失败' });
      }
    }
    if (!added && skipped.length)
      throw new BadRequestException(skipped.map((s) => `${s.filename}：${s.reason}`).join('；'));
    await this.refresh();
    return { files: await this.listFiles(), skipped };
  }

  async setFileEnabled(id: number, enabled: boolean): Promise<any[]> {
    const row = await this.files.findOne({ where: { id } });
    if (!row) throw new NotFoundException('词库文件不存在');
    await this.files.update({ id }, { enabled: enabled ? 1 : 0 });
    await this.refresh();
    return this.listFiles();
  }

  async deleteFile(id: number): Promise<any[]> {
    const res = await this.files.delete({ id });
    if (!res.affected) throw new NotFoundException('词库文件不存在');
    await this.refresh();
    return this.listFiles();
  }

  async onModuleInit(): Promise<void> {
    await this.refresh().catch(() => undefined);
    // 周期刷新作兜底（admin 写入会主动 refresh，但其它进程/直改 DB 也能在 20s 内生效）
    this.timer = setInterval(() => {
      this.refresh().catch(() => undefined);
    }, 20000);
    if (this.timer.unref) this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
