import { extname } from 'path';
import { randomBytes } from 'crypto';

/**
 * S3/COS 对象键：uploads/YYYY/MM/<timestamp>-<random><ext>
 * 用亚洲/上海时区切月份，避免每月 1 号 00:00–08:00 的文件落进上个月。
 * 本地磁盘仍保持原来的根目录扁平结构，避免影响已有 /uploads 链接。
 */
export function buildObjectKey(
  originalName: string,
  now: Date = new Date(),
  random: string = randomBytes(6).toString('hex'),
  prefix = 'uploads',
): string {
  const ext = extname(originalName || '');
  const yearMonth = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
  }).format(now);
  const [year, month] = yearMonth.split('-');
  const cleanPrefix = prefix.replace(/^\/+|\/+$/g, '') || 'uploads';
  return `${cleanPrefix}/${year}/${month}/${now.getTime()}-${random}${ext}`;
}
