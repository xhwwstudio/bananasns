import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, createHmac, randomInt } from 'crypto';
import nodemailer from 'nodemailer';
import { User } from '../../database/entities';
import { SiteService } from '../site/site.service';

const SMS_TTL_SEC = 300;
const EMAIL_TTL_SEC = 600;
const COOLDOWN_SEC = 60;
const MAX_ATTEMPTS = 5;

/**
 * 注册手机/邮箱验证。
 * - 腾讯云短信：直接走 SendSms API（TC3-HMAC-SHA256 签名，不引入额外 SDK）
 * - 邮箱：nodemailer SMTP，后台可配
 * - 验证码存 Redis（只存 HMAC，不存明文），5 分钟/10 分钟有效，5 次尝试上限
 */
@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly site: SiteService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  private async cfg(key: string, fallback = ''): Promise<string> {
    return (await this.site.getConfig(key, fallback)) ?? fallback;
  }

  async phoneRequired(): Promise<boolean> {
    return (await this.cfg('register_phone_verify', '0')) === '1';
  }

  async emailRequired(): Promise<boolean> {
    return (await this.cfg('register_email_verify', '0')) === '1';
  }

  private normalizePhone(raw: string): string {
    const phone = String(raw || '').replace(/[\s-]/g, '').replace(/^\+?86/, '');
    if (!/^1[3-9]\d{9}$/.test(phone)) throw new BadRequestException('请输入正确的中国大陆手机号');
    return phone;
  }

  private normalizeEmail(raw: string): string {
    const email = String(raw || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 128)
      throw new BadRequestException('请输入正确的邮箱地址');
    return email;
  }

  private codeHash(kind: string, target: string, code: string): string {
    const secret = process.env.JWT_SECRET || 'bananasns-verify';
    return createHmac('sha256', secret).update(`${kind}:${target}:${code}`).digest('hex');
  }

  private codeKey(kind: string, target: string): string {
    return `verify:${kind}:code:${target}`;
  }
  private attemptKey(kind: string, target: string): string {
    return `verify:${kind}:attempts:${target}`;
  }
  private cooldownKey(kind: string, target: string): string {
    return `verify:${kind}:cooldown:${target}`;
  }

  /** 发送前的频率限制：同目标 60s、同 IP 每日 10 次、同目标每小时 5 次。 */
  private async guardSend(kind: string, target: string, ip?: string): Promise<void> {
    try {
      if (await this.cache.get(this.cooldownKey(kind, target)))
        throw new BadRequestException('发送太频繁，请 60 秒后再试');
      if (ip) {
        const bucket = Math.floor(Date.now() / 1000 / 86400);
        const key = `verify:${kind}:ip:${ip}:${bucket}`;
        const n = Number(await this.cache.get(key)) || 0;
        if (n >= 10) throw new BadRequestException('该网络今日发送次数已达上限');
      }
      const hour = Math.floor(Date.now() / 1000 / 3600);
      const hKey = `verify:${kind}:hour:${target}:${hour}`;
      const hn = Number(await this.cache.get(hKey)) || 0;
      if (hn >= 5) throw new BadRequestException('该账号每小时最多获取 5 次验证码');
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      // Redis 故障时宁可拒绝发送，也不做无验证注册
      throw new ServiceUnavailableException('验证服务暂不可用，请稍后再试');
    }
  }

  private async recordSend(kind: string, target: string, ip?: string): Promise<void> {
    await this.cache.set(this.cooldownKey(kind, target), 1, COOLDOWN_SEC * 1000);
    if (ip) {
      const bucket = Math.floor(Date.now() / 1000 / 86400);
      const key = `verify:${kind}:ip:${ip}:${bucket}`;
      const n = Number(await this.cache.get(key)) || 0;
      await this.cache.set(key, n + 1, 86400 * 1000);
    }
    const hour = Math.floor(Date.now() / 1000 / 3600);
    const hKey = `verify:${kind}:hour:${target}:${hour}`;
    const hn = Number(await this.cache.get(hKey)) || 0;
    await this.cache.set(hKey, hn + 1, 3600 * 1000);
  }

  private async storeCode(kind: string, target: string, code: string, ttlSec: number): Promise<void> {
    await this.cache.set(this.codeKey(kind, target), this.codeHash(kind, target, code), ttlSec * 1000);
    await this.cache.set(this.attemptKey(kind, target), 0, ttlSec * 1000);
  }

  private async assertCode(kind: string, target: string, code: string): Promise<void> {
    const expected = await this.cache.get(this.codeKey(kind, target));
    if (!expected) throw new BadRequestException('验证码已过期，请重新获取');
    const attempts = Number(await this.cache.get(this.attemptKey(kind, target))) || 0;
    if (attempts >= MAX_ATTEMPTS) throw new BadRequestException('验证码尝试次数过多，请重新获取');
    await this.cache.set(this.attemptKey(kind, target), attempts + 1, 10 * 60 * 1000);
    if (this.codeHash(kind, target, String(code || '').trim()) !== expected)
      throw new BadRequestException('验证码不正确');
  }

  private async consumeCode(kind: string, target: string): Promise<void> {
    await this.cache.del(this.codeKey(kind, target));
    await this.cache.del(this.attemptKey(kind, target));
  }

  // ---- 手机号 ----
  async sendPhoneCode(rawPhone: string, ip?: string): Promise<{ ok: true; expiresIn: number }> {
    if (!(await this.phoneRequired()))
      throw new BadRequestException('本站未开启手机号验证');
    const phone = this.normalizePhone(rawPhone);
    if (await this.users.findOne({ where: { phone } }))
      throw new ConflictException('该手机号已被绑定');
    await this.guardSend('sms', phone, ip);

    const code = String(randomInt(100000, 1000000));
    await this.sendTencentSms(phone, code);
    await this.storeCode('sms', phone, code, SMS_TTL_SEC);
    await this.recordSend('sms', phone, ip);
    return { ok: true, expiresIn: SMS_TTL_SEC };
  }

  async assertPhoneCode(rawPhone: string, code: string): Promise<string> {
    const phone = this.normalizePhone(rawPhone);
    await this.assertCode('sms', phone, code);
    return phone;
  }

  async consumePhoneCode(phone: string): Promise<void> {
    await this.consumeCode('sms', phone);
  }

  // ---- 邮箱 ----
  async sendEmailCode(rawEmail: string, ip?: string): Promise<{ ok: true; expiresIn: number }> {
    if (!(await this.emailRequired()))
      throw new BadRequestException('本站未开启邮箱验证');
    const email = this.normalizeEmail(rawEmail);
    if (await this.users.findOne({ where: { email } }))
      throw new ConflictException('该邮箱已被绑定');
    await this.guardSend('email', email, ip);

    const code = String(randomInt(100000, 1000000));
    await this.sendEmail(email, code);
    await this.storeCode('email', email, code, EMAIL_TTL_SEC);
    await this.recordSend('email', email, ip);
    return { ok: true, expiresIn: EMAIL_TTL_SEC };
  }

  async assertEmailCode(rawEmail: string, code: string): Promise<string> {
    const email = this.normalizeEmail(rawEmail);
    await this.assertCode('email', email, code);
    return email;
  }

  async consumeEmailCode(email: string): Promise<void> {
    await this.consumeCode('email', email);
  }

  // ---- 腾讯云短信 SendSms ----
  private async sendTencentSms(phone: string, code: string): Promise<void> {
    const secretId = await this.cfg('sms_secret_id');
    const secretKey = await this.cfg('sms_secret_key');
    const appId = await this.cfg('sms_sdk_app_id');
    const signName = await this.cfg('sms_sign_name');
    const templateId = await this.cfg('sms_template_id');
    const region = (await this.cfg('sms_region', 'ap-guangzhou')) || 'ap-guangzhou';
    if (!secretId || !secretKey || !appId || !signName || !templateId)
      throw new ServiceUnavailableException(
        '短信服务未配置完整（SecretId / SecretKey / SdkAppId / 签名 / 模板 ID）',
      );

    const payload = JSON.stringify({
      PhoneNumberSet: [`+86${phone}`],
      SmsSdkAppId: appId,
      SignName: signName,
      TemplateId: templateId,
      TemplateParamSet: [code, String(Math.ceil(SMS_TTL_SEC / 60))],
    });
    const host = 'sms.tencentcloudapi.com';
    const timestamp = Math.floor(Date.now() / 1000);
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    const service = 'sms';
    const hashedPayload = createHash('sha256').update(payload).digest('hex');
    const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\n`;
    const signedHeaders = 'content-type;host';
    const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${hashedPayload}`;
    const credentialScope = `${date}/${service}/tc3_request`;
    const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${createHash('sha256').update(canonicalRequest).digest('hex')}`;
    const kDate = createHmac('sha256', `TC3${secretKey}`).update(date).digest();
    const kService = createHmac('sha256', kDate).update(service).digest();
    const kSigning = createHmac('sha256', kService).update('tc3_request').digest();
    const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 12000);
    try {
      const res = await fetch(`https://${host}`, {
        method: 'POST',
        headers: {
          Authorization: `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
          'Content-Type': 'application/json; charset=utf-8',
          Host: host,
          'X-TC-Action': 'SendSms',
          'X-TC-Version': '2021-01-11',
          'X-TC-Timestamp': String(timestamp),
          'X-TC-Region': region,
        },
        body: payload,
        signal: ac.signal,
      });
      const data: any = await res.json().catch(() => ({}));
      const err = data?.Response?.Error;
      if (err) throw new Error(`${err.Code || 'SmsError'}: ${err.Message || '短信发送失败'}`);
      const status = data?.Response?.SendStatusSet?.[0];
      if (!status || status.Code !== 'Ok')
        throw new Error(status?.Message || '短信发送失败');
    } catch (e: any) {
      this.logger.warn(`SMS send failed: ${e?.message || e}`);
      throw new BadRequestException(`短信发送失败：${e?.message || '请稍后再试'}`);
    } finally {
      clearTimeout(timer);
    }
  }

  // ---- SMTP 邮件 ----
  private async sendEmail(email: string, code: string): Promise<void> {
    const host = await this.cfg('smtp_host');
    const port = Number(await this.cfg('smtp_port', '465')) || 465;
    const user = await this.cfg('smtp_user');
    const pass = await this.cfg('smtp_pass');
    const from = (await this.cfg('smtp_from')) || user;
    const secure = (await this.cfg('smtp_secure', '1')) === '1';
    if (!host || !user || !pass || !from)
      throw new ServiceUnavailableException('邮件服务未配置完整（SMTP Host / 账号 / 密码 / 发件人）');

    const siteName = (await this.cfg('site_name', 'BananaSNS')) || 'BananaSNS';
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
    try {
      await transporter.sendMail({
        from,
        to: email,
        subject: `${siteName} 注册验证码`,
        text: `你的注册验证码是 ${code}，${Math.ceil(EMAIL_TTL_SEC / 60)} 分钟内有效。如非本人操作请忽略。`,
        html: `<p>你的注册验证码是 <b style="font-size:20px;letter-spacing:2px">${code}</b></p><p>${Math.ceil(EMAIL_TTL_SEC / 60)} 分钟内有效。如非本人操作请忽略。</p>`,
      });
    } catch (e: any) {
      this.logger.warn(`Email send failed: ${e?.message || e}`);
      throw new BadRequestException(`邮件发送失败：${e?.message || '请稍后再试'}`);
    }
  }
}
