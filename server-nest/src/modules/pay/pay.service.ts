import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { PaymentOrder, User } from '../../database/entities';
import { SiteService } from '../site/site.service';
import { HelpersService } from '../../common/helpers.service';

const POINTS_PER_YUAN = 100; // 1 元 = 100 积分

/**
 * 易支付（彩虹/标准 epay 协议）端到端：下单 → MD5 签名 → 跳转 → 异步回调验签 → 到账。
 * 凭据(pid/key/网关)存 site_config，仅 admin 可改；本服务读取使用。
 */
@Injectable()
export class PayService {
  constructor(
    @InjectRepository(PaymentOrder)
    private readonly orders: Repository<PaymentOrder>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly site: SiteService,
    private readonly helpers: HelpersService,
  ) {}

  private md5(s: string): string {
    return crypto.createHash('md5').update(s, 'utf8').digest('hex');
  }

  /**
   * 原子地把订单从 pending 置为 paid，返回是否由本次调用完成状态迁移。
   * 支付网关可能并发/重复回调：先查后写的 check-then-act 会让两个请求同时看到 pending 并各加一次积分，
   * 造成重复到账。这里用带 status='pending' 条件的 UPDATE，只有 affected=1 的那次才发积分。
   */
  private async markPaid(order: PaymentOrder, tradeNo: string): Promise<boolean> {
    const res = await this.orders.update(
      { id: order.id, status: 'pending' },
      { status: 'paid', trade_no: tradeNo || '', paid_at: this.helpers.nowSql() },
    );
    return (res.affected || 0) > 0;
  }

  // 签名：非空参数(排除 sign/sign_type)按 key 升序拼 a=1&b=2…，末尾直接接商户 KEY，md5 小写
  private epaySign(params: Record<string, any>, key: string): string {
    const keys = Object.keys(params)
      .filter((k) => k !== 'sign' && k !== 'sign_type' && params[k] !== '' && params[k] != null)
      .sort();
    const str = keys.map((k) => `${k}=${params[k]}`).join('&') + key;
    return this.md5(str);
  }

  private async epayConfig() {
    return {
      enabled: (await this.site.getConfig('pay_epay_enabled')) === '1',
      pid: (await this.site.getConfig('pay_epay_pid')) || '',
      key: (await this.site.getConfig('pay_epay_key')) || '',
      url: (await this.site.getConfig('pay_epay_url')) || '',
    };
  }

  // 创建易支付订单，返回跳转支付的 URL
  async createEpay(user: User, amountRaw: any, channelRaw: string, baseUrl: string) {
    const cfg = await this.epayConfig();
    if (!cfg.enabled || !cfg.pid || !cfg.key || !cfg.url)
      throw new BadRequestException('易支付未配置或未启用');
    const amt = Math.round((Number(amountRaw) || 0) * 100) / 100;
    if (!(amt >= 1 && amt <= 100000))
      throw new BadRequestException('金额需在 1–100000 元之间');
    const money = amt.toFixed(2);
    const type = channelRaw === 'wxpay' ? 'wxpay' : 'alipay';
    const points = Math.round(amt * POINTS_PER_YUAN);
    const outTradeNo =
      'E' + this.helpers.nowSql().replace(/\D/g, '') + Math.floor(1000 + Math.random() * 9000);
    await this.orders.save(
      this.orders.create({
        out_trade_no: outTradeNo,
        user_id: user.id,
        gateway: 'epay',
        channel: type,
        amount: money,
        points,
        status: 'pending',
        created_at: this.helpers.nowSql(),
      }),
    );
    const gw = cfg.url.endsWith('/') ? cfg.url : cfg.url + '/';
    const params: Record<string, string> = {
      pid: cfg.pid,
      type,
      out_trade_no: outTradeNo,
      notify_url: `${baseUrl}/api/pay/epay/notify`,
      return_url: `${baseUrl}/api/pay/epay/return`,
      name: `积分充值 ${points}`,
      money,
      sign_type: 'MD5',
    };
    params.sign = this.epaySign(params, cfg.key);
    const qs = Object.keys(params)
      .map((k) => `${k}=${encodeURIComponent(params[k])}`)
      .join('&');
    return { payUrl: `${gw}submit.php?${qs}`, outTradeNo, points, money };
  }

  // 异步回调：验签 → 标记已支付 → 到账积分（幂等）。成功须返回字面量 "success"
  async handleEpayNotify(query: Record<string, string>): Promise<string> {
    const cfg = await this.epayConfig();
    if (!cfg.key) return 'fail';
    if (!query.sign || query.sign !== this.epaySign(query, cfg.key)) return 'fail';
    if (query.trade_status !== 'TRADE_SUCCESS') return 'fail';
    const order = await this.orders.findOne({ where: { out_trade_no: query.out_trade_no } });
    if (!order) return 'fail';
    // 金额校验：签名已覆盖金额，这里再对一次订单，防止网关/配置异常导致少付多得。
    if (query.money != null && Number(query.money) !== Number(order.amount)) return 'fail';
    if (order.status === 'paid') return 'success'; // 幂等：重复回调
    if (!(await this.markPaid(order, query.trade_no))) return 'success'; // 并发回调已处理
    await this.helpers.award(order.user_id, { points: order.points });
    await this.helpers
      .notify({ userId: order.user_id, type: 'system', preview: `充值成功，到账 ${order.points} 积分` })
      .catch(() => undefined);
    return 'success';
  }

  // ===================== 支付宝官方直连（RSA2, alipay.trade.page.pay）=====================
  // 凭据存 site_config：pay_alipay_appid / pay_alipay_key(商户应用私钥) / pay_alipay_public_key(支付宝公钥) / pay_alipay_gateway。
  // 等用户提供测试商户(沙箱或正式)的 AppID + 应用私钥 + 支付宝公钥即可启用；本地无凭据时下单返回"未配置"。
  private async alipayConfig() {
    return {
      enabled: (await this.site.getConfig('pay_alipay_enabled')) === '1',
      appid: (await this.site.getConfig('pay_alipay_appid')) || '',
      privateKey: (await this.site.getConfig('pay_alipay_key')) || '',
      publicKey: (await this.site.getConfig('pay_alipay_public_key')) || '',
      gateway:
        (await this.site.getConfig('pay_alipay_gateway')) ||
        'https://openapi.alipay.com/gateway.do',
    };
  }

  // 把商户粘贴的裸 base64 密钥补成 PEM（已是 PEM 则原样返回）
  private pemWrap(raw: string, label: string): string {
    const s = (raw || '').trim();
    if (!s || s.includes('-----BEGIN')) return s;
    const body = s.replace(/\s+/g, '').match(/.{1,64}/g)?.join('\n') || '';
    return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----`;
  }

  // 待签名串：非空参数按 key 升序拼 a=1&b=2…（请求签名含 sign_type；异步回调验签排除 sign_type）
  private alipaySignStr(params: Record<string, any>, excludeSignType: boolean): string {
    const exclude = excludeSignType ? ['sign', 'sign_type'] : ['sign'];
    return Object.keys(params)
      .filter((k) => !exclude.includes(k) && params[k] !== '' && params[k] != null)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join('&');
  }

  private alipaySign(params: Record<string, any>, privateKeyRaw: string): string {
    const str = this.alipaySignStr(params, false);
    const pem = this.pemWrap(privateKeyRaw, 'PRIVATE KEY');
    return crypto.createSign('RSA-SHA256').update(str, 'utf8').sign(pem, 'base64');
  }

  private alipayVerify(params: Record<string, any>, publicKeyRaw: string): boolean {
    const str = this.alipaySignStr(params, true);
    const pem = this.pemWrap(publicKeyRaw, 'PUBLIC KEY');
    try {
      return crypto
        .createVerify('RSA-SHA256')
        .update(str, 'utf8')
        .verify(pem, String(params.sign || ''), 'base64');
    } catch {
      return false;
    }
  }

  // 创建支付宝订单，返回跳转支付的 URL（PC 网页支付 alipay.trade.page.pay）
  async createAlipay(user: User, amountRaw: any, baseUrl: string) {
    const cfg = await this.alipayConfig();
    if (!cfg.enabled || !cfg.appid || !cfg.privateKey)
      throw new BadRequestException('支付宝未配置或未启用');
    const amt = Math.round((Number(amountRaw) || 0) * 100) / 100;
    if (!(amt >= 1 && amt <= 100000))
      throw new BadRequestException('金额需在 1–100000 元之间');
    const money = amt.toFixed(2);
    const points = Math.round(amt * POINTS_PER_YUAN);
    const outTradeNo =
      'A' + this.helpers.nowSql().replace(/\D/g, '') + Math.floor(1000 + Math.random() * 9000);
    await this.orders.save(
      this.orders.create({
        out_trade_no: outTradeNo,
        user_id: user.id,
        gateway: 'alipay',
        channel: 'alipay',
        amount: money,
        points,
        status: 'pending',
        created_at: this.helpers.nowSql(),
      }),
    );
    const bizContent = JSON.stringify({
      out_trade_no: outTradeNo,
      total_amount: money,
      subject: `积分充值 ${points}`,
      product_code: 'FAST_INSTANT_TRADE_PAY',
    });
    const params: Record<string, string> = {
      app_id: cfg.appid,
      method: 'alipay.trade.page.pay',
      format: 'JSON',
      charset: 'utf-8',
      sign_type: 'RSA2',
      timestamp: this.helpers.nowSql(),
      version: '1.0',
      notify_url: `${baseUrl}/api/pay/alipay/notify`,
      return_url: `${baseUrl}/api/pay/alipay/return`,
      biz_content: bizContent,
    };
    params.sign = this.alipaySign(params, cfg.privateKey);
    const qs = Object.keys(params)
      .map((k) => `${k}=${encodeURIComponent(params[k])}`)
      .join('&');
    return { payUrl: `${cfg.gateway}?${qs}`, outTradeNo, points, money };
  }

  // 支付宝异步回调（POST 表单）：验签 + 校验 appid/金额 → 到账（幂等）。成功须返回字面量 "success"
  async handleAlipayNotify(body: Record<string, string>): Promise<string> {
    const cfg = await this.alipayConfig();
    if (!cfg.publicKey) return 'fail';
    if (!body.sign || !this.alipayVerify(body, cfg.publicKey)) return 'fail';
    if (body.app_id && cfg.appid && body.app_id !== cfg.appid) return 'fail';
    if (body.trade_status !== 'TRADE_SUCCESS' && body.trade_status !== 'TRADE_FINISHED')
      return 'fail';
    const order = await this.orders.findOne({ where: { out_trade_no: body.out_trade_no } });
    if (!order) return 'fail';
    if (Number(body.total_amount) !== Number(order.amount)) return 'fail'; // 防金额篡改
    if (order.status === 'paid') return 'success'; // 幂等：重复回调
    if (!(await this.markPaid(order, body.trade_no))) return 'success'; // 并发回调已处理
    await this.helpers.award(order.user_id, { points: order.points });
    await this.helpers
      .notify({ userId: order.user_id, type: 'system', preview: `充值成功，到账 ${order.points} 积分` })
      .catch(() => undefined);
    return 'success';
  }

  // ===================== 微信支付 v3 · Native 扫码 =====================
  // 凭据存 site_config：pay_wechat_appid / pay_wechat_mchid / pay_wechat_key(APIv3 密钥,32位) /
  //   pay_wechat_private_key(商户 API 私钥) / pay_wechat_serial(商户证书序列号)。
  // 等用户给微信商户号 + APIv3 密钥 + API 私钥 + 证书序列号即可启用；本地无凭据时下单返回"未配置"。
  private async wechatConfig() {
    return {
      enabled: (await this.site.getConfig('pay_wechat_enabled')) === '1',
      appid: (await this.site.getConfig('pay_wechat_appid')) || '',
      mchid: (await this.site.getConfig('pay_wechat_mchid')) || '',
      apiV3Key: (await this.site.getConfig('pay_wechat_key')) || '',
      privateKey: (await this.site.getConfig('pay_wechat_private_key')) || '',
      serial: (await this.site.getConfig('pay_wechat_serial')) || '',
    };
  }

  // v3 请求签名：待签名串 = METHOD\nURL\nTIMESTAMP\nNONCE\nBODY\n，RSA-SHA256 用商户私钥签，base64
  private wechatReqSign(
    method: string,
    url: string,
    timestamp: string,
    nonce: string,
    body: string,
    privateKeyRaw: string,
  ): string {
    const msg = `${method}\n${url}\n${timestamp}\n${nonce}\n${body}\n`;
    const pem = this.pemWrap(privateKeyRaw, 'PRIVATE KEY');
    return crypto.createSign('RSA-SHA256').update(msg, 'utf8').sign(pem, 'base64');
  }

  // 回调资源解密：AES-256-GCM，key=APIv3 密钥，密文末 16 字节为 authTag
  private wechatDecrypt(apiV3Key: string, nonce: string, aad: string, ciphertextB64: string): string {
    const data = Buffer.from(ciphertextB64, 'base64');
    const authTag = data.subarray(data.length - 16);
    const enc = data.subarray(0, data.length - 16);
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      Buffer.from(apiV3Key, 'utf8'),
      Buffer.from(nonce, 'utf8'),
    );
    decipher.setAuthTag(authTag);
    decipher.setAAD(Buffer.from(aad || '', 'utf8'));
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  }

  // 创建微信 Native 订单，调用微信下单接口拿 code_url（前台渲染二维码）
  async createWechat(user: User, amountRaw: any, baseUrl: string) {
    const cfg = await this.wechatConfig();
    if (!cfg.enabled || !cfg.appid || !cfg.mchid || !cfg.privateKey || !cfg.serial)
      throw new BadRequestException('微信支付未配置或未启用');
    const amt = Math.round((Number(amountRaw) || 0) * 100) / 100;
    if (!(amt >= 1 && amt <= 100000))
      throw new BadRequestException('金额需在 1–100000 元之间');
    const money = amt.toFixed(2);
    const total = Math.round(amt * 100); // 微信以「分」为单位
    const points = Math.round(amt * POINTS_PER_YUAN);
    const outTradeNo =
      'W' + this.helpers.nowSql().replace(/\D/g, '') + Math.floor(1000 + Math.random() * 9000);
    await this.orders.save(
      this.orders.create({
        out_trade_no: outTradeNo,
        user_id: user.id,
        gateway: 'wechat',
        channel: 'wechat',
        amount: money,
        points,
        status: 'pending',
        created_at: this.helpers.nowSql(),
      }),
    );
    const path = '/v3/pay/transactions/native';
    const body = JSON.stringify({
      appid: cfg.appid,
      mchid: cfg.mchid,
      description: `积分充值 ${points}`,
      out_trade_no: outTradeNo,
      notify_url: `${baseUrl}/api/pay/wechat/notify`,
      amount: { total, currency: 'CNY' },
    });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomBytes(16).toString('hex');
    const signature = this.wechatReqSign('POST', path, timestamp, nonce, body, cfg.privateKey);
    const auth =
      `WECHATPAY2-SHA256-RSA2048 mchid="${cfg.mchid}",nonce_str="${nonce}",` +
      `signature="${signature}",timestamp="${timestamp}",serial_no="${cfg.serial}"`;
    let data: any = {};
    try {
      const resp = await fetch('https://api.mch.weixin.qq.com' + path, {
        method: 'POST',
        headers: {
          Authorization: auth,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': 'BananaSNS',
        },
        body,
      });
      data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.code_url)
        throw new BadRequestException(data.message || '微信下单失败');
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException('微信下单请求失败：' + (e?.message || 'network'));
    }
    return { codeUrl: data.code_url, outTradeNo, points, money };
  }

  // 微信异步回调（POST JSON，资源 AES-GCM 加密）：解密 → 校验状态/金额 → 到账（幂等）
  // 返回 { code:'SUCCESS' } 表示已处理；微信据此停止重试。
  async handleWechatNotify(body: any): Promise<{ code: string; message?: string }> {
    const cfg = await this.wechatConfig();
    if (!cfg.apiV3Key) return { code: 'FAIL', message: '未配置' };
    try {
      const res = body?.resource;
      if (!res?.ciphertext) return { code: 'FAIL', message: '无资源数据' };
      const plain = this.wechatDecrypt(
        cfg.apiV3Key,
        res.nonce,
        res.associated_data,
        res.ciphertext,
      ); // 解密成功本身即证明来自微信(只有微信知道 APIv3 密钥 + GCM 校验完整性)
      const info = JSON.parse(plain);
      if (info.trade_state !== 'SUCCESS') return { code: 'FAIL', message: '未支付成功' };
      const order = await this.orders.findOne({ where: { out_trade_no: info.out_trade_no } });
      if (!order) return { code: 'FAIL', message: '订单不存在' };
      if (Number(info.amount?.total) !== Math.round(Number(order.amount) * 100))
        return { code: 'FAIL', message: '金额不符' }; // 防篡改
      if (order.status === 'paid') return { code: 'SUCCESS' }; // 幂等
      if (!(await this.markPaid(order, info.transaction_id))) return { code: 'SUCCESS' }; // 并发回调已处理
      await this.helpers.award(order.user_id, { points: order.points });
      await this.helpers
        .notify({ userId: order.user_id, type: 'system', preview: `充值成功，到账 ${order.points} 积分` })
        .catch(() => undefined);
      return { code: 'SUCCESS' };
    } catch {
      return { code: 'FAIL', message: '处理失败' };
    }
  }

  async myOrders(user: User) {
    const rows = await this.orders.find({
      where: { user_id: user.id },
      order: { id: 'DESC' },
      take: 20,
    });
    return {
      orders: rows.map((o) => ({
        outTradeNo: o.out_trade_no,
        amount: o.amount,
        points: o.points,
        status: o.status,
        channel: o.channel,
        createdAt: o.created_at,
      })),
    };
  }

  // GET /api/pay/admin/orders —— 管理员查看全部充值订单(近 50) + 汇总(已支付笔数/金额/积分)
  async adminOrders(user: User) {
    if (user.role !== 'admin') throw new ForbiddenException('无权操作');
    const rows = await this.orders.find({ order: { id: 'DESC' }, take: 50 });
    const ids = [...new Set(rows.map((o) => o.user_id))];
    const us = ids.length ? await this.users.find({ where: { id: In(ids) } }) : [];
    const umap = new Map(us.map((u) => [u.id, u]));
    const paid = rows.filter((o) => o.status === 'paid');
    return {
      stats: {
        total: rows.length,
        paidCount: paid.length,
        paidAmount: paid.reduce((s, o) => s + Number(o.amount), 0).toFixed(2),
        paidPoints: paid.reduce((s, o) => s + o.points, 0),
      },
      orders: rows.map((o) => {
        const u = umap.get(o.user_id);
        return {
          outTradeNo: o.out_trade_no,
          user: u ? { id: u.id, nickname: u.nickname, username: u.username } : null,
          gateway: o.gateway,
          channel: o.channel,
          amount: o.amount,
          points: o.points,
          status: o.status,
          createdAt: o.created_at,
          paidAt: o.paid_at,
        };
      }),
    };
  }
}
