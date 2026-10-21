// Relative time in Chinese
export function timeAgo(iso?: string | null): string {
  if (!iso) return '';
  const then = new Date(iso.replace(' ', 'T') + (iso.includes('Z') ? '' : 'Z')).getTime();
  const diff = Math.max(0, Date.now() - then);
  const s = Math.floor(diff / 1000);
  if (s < 60) return '刚刚';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}天前`;
  const date = new Date(then);
  const now = new Date();
  if (date.getFullYear() === now.getFullYear())
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

export function clockTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T') + (iso.includes('Z') ? '' : 'Z'));
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 1234 -> 1.2k, 12345 -> 1.2w
export function fmtNum(n: number | string | null | undefined): string {
  const v = Number(n) || 0;
  if (v < 1000) return String(v);
  if (v < 10000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return (v / 10000).toFixed(1).replace(/\.0$/, '') + 'w';
}

export interface RichPart {
  t: 'text' | 'topic' | 'mention' | 'bold' | 'strike' | 'code' | 'link';
  v: string;
  h?: string; // href, only for link parts
}

// Parse text into rich inline segments: [text](url), **bold**, ~~strike~~, `code`, #topic#, @mention, plain
export function parseRich(text = ''): RichPart[] {
  const parts: RichPart[] = [];
  const re = /\[([^\]\n]{1,80})\]\(([^)\s]{1,300})\)|\*\*([^*\n]{1,200}?)\*\*|~~([^~\n]{1,200}?)~~|`([^`\n]{1,200}?)`|#([^#\n]{1,30})#|@([一-龥A-Za-z0-9_]{1,20})/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ t: 'text', v: text.slice(last, m.index) });
    if (m[1] !== undefined) parts.push({ t: 'link', v: m[1], h: m[2] });
    else if (m[3] !== undefined) parts.push({ t: 'bold', v: m[3] });
    else if (m[4] !== undefined) parts.push({ t: 'strike', v: m[4] });
    else if (m[5] !== undefined) parts.push({ t: 'code', v: m[5] });
    else if (m[6] !== undefined) parts.push({ t: 'topic', v: m[6] });
    else if (m[7] !== undefined) parts.push({ t: 'mention', v: m[7] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ t: 'text', v: text.slice(last) });
  return parts;
}

export interface RichBlock {
  t: 'p' | 'h1' | 'h2' | 'h3' | 'ul' | 'ol' | 'quote' | 'img';
  items: string[]; // lists: one entry per item · p/quote: one entry per line · headings: a single entry
  src?: string;    // img block: 图片地址
  alt?: string;    // img block: 替代文字
}

const IMG_LINE = /^!\[([^\]\n]{0,80})\]\(([^)\s]{1,500})\)\s*$/; // 独占一行的 ![alt](url) → 块级图片

// Split text into block-level chunks: ![](img), # heading, > quote, - / * list, 1. ordered list, blank-line-separated paragraphs.
// Inline markers inside each line are still handled by parseRich. Topic #x# (no space) is NOT mistaken for a heading.
export function parseBlocks(text = ''): RichBlock[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: RichBlock[] = [];
  const isQuote = (s: string) => /^>\s?/.test(s);
  const isUl = (s: string) => /^[-*]\s+/.test(s);
  const isOl = (s: string) => /^\d+\.\s+/.test(s);
  const isH = (s: string) => /^#{1,3}\s+/.test(s);
  const isImg = (s: string) => IMG_LINE.test(s);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') { i++; continue; }
    const img = IMG_LINE.exec(line);
    if (img) { blocks.push({ t: 'img', items: [], alt: img[1], src: img[2] }); i++; continue; }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) { blocks.push({ t: ('h' + h[1].length) as RichBlock['t'], items: [h[2]] }); i++; continue; }
    if (isQuote(line)) { const items: string[] = []; while (i < lines.length && isQuote(lines[i])) { items.push(lines[i].replace(/^>\s?/, '')); i++; } blocks.push({ t: 'quote', items }); continue; }
    if (isUl(line)) { const items: string[] = []; while (i < lines.length && isUl(lines[i])) { items.push(lines[i].replace(/^[-*]\s+/, '')); i++; } blocks.push({ t: 'ul', items }); continue; }
    if (isOl(line)) { const items: string[] = []; while (i < lines.length && isOl(lines[i])) { items.push(lines[i].replace(/^\d+\.\s+/, '')); i++; } blocks.push({ t: 'ol', items }); continue; }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !isH(lines[i]) && !isQuote(lines[i]) && !isUl(lines[i]) && !isOl(lines[i]) && !isImg(lines[i])) { para.push(lines[i]); i++; }
    blocks.push({ t: 'p', items: para });
  }
  return blocks;
}

export const VIS_LABELS: Record<string, { label: string; icon: string }> = {
  public: { label: '公开', icon: '🌐' },
  followers: { label: '仅关注我', icon: '👥' },
  login: { label: '登录用户可见', icon: '🔐' },
  private: { label: '私密', icon: '🔒' },
  password: { label: '密码', icon: '🔑' },
  paid: { label: '付费', icon: '💎' },
  anonymous: { label: '匿名', icon: '🕶️' },
};

export const GENDER: Record<string, string> = { male: '♂', female: '♀', secret: '' };
