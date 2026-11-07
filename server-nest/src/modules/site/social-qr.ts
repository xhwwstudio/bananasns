/**
 * 右栏「社交媒体二维码」配置。存 site_config.social_qr（JSON 字符串）。
 * 所有图片/链接只允许 http(s) 或站内 / 开头，防止 javascript: 等注入。
 */
export interface SocialQrItem {
  key: string;
  name: string;
  qr: string;
  url: string;
}

export interface SocialQrConfig {
  groupTitle: string;
  groupText: string;
  groupQr: string;
  items: SocialQrItem[];
}

export const SOCIAL_QR_ITEMS = [
  { key: 'xiaohongshu', name: '小红书' },
  { key: 'douyin', name: '抖音' },
  { key: 'weibo', name: '微博' },
  { key: 'channels', name: '视频号' },
] as const;

function safeUrl(v: unknown): string {
  const s = String(v || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s.slice(0, 1000);
  if (/^\/(?!\/)/.test(s)) return s.slice(0, 1000); // 站内 /uploads/... 等
  return '';
}

function text(v: unknown, max: number): string {
  return String(v || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
}

export function emptySocialQr(): SocialQrConfig {
  return {
    groupTitle: '扫码进聊天群',
    groupText: '扫码加入官方聊天群，获取最新动态与交流',
    groupQr: '',
    items: SOCIAL_QR_ITEMS.map((x) => ({ ...x, qr: '', url: '' })),
  };
}

export function parseSocialQr(raw: unknown): SocialQrConfig {
  const base = emptySocialQr();
  let obj: any = raw;
  if (typeof raw === 'string') {
    if (!raw.trim()) return base;
    try { obj = JSON.parse(raw); } catch { return base; }
  }
  if (!obj || typeof obj !== 'object') return base;
  const rawItems = Array.isArray(obj.items) ? obj.items : [];
  const byKey = new Map<string, any>();
  for (const it of rawItems) {
    if (it && typeof it === 'object' && SOCIAL_QR_ITEMS.some((x) => x.key === it.key))
      byKey.set(it.key, it);
  }
  return {
    groupTitle: text(obj.groupTitle, 40) || base.groupTitle,
    groupText: text(obj.groupText, 80) || base.groupText,
    groupQr: safeUrl(obj.groupQr),
    items: SOCIAL_QR_ITEMS.map((x) => {
      const it = byKey.get(x.key);
      return {
        key: x.key,
        name: text(it?.name, 20) || x.name,
        qr: safeUrl(it?.qr),
        url: safeUrl(it?.url),
      };
    }),
  };
}

/** 至少有一个可展示的二维码/链接 */
export function hasSocialQr(c: SocialQrConfig): boolean {
  return !!(c.groupQr || c.items.some((i) => i.qr || i.url));
}
