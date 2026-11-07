/**
 * 解析站长上传的敏感词文件。
 * 兼容 sensitive-stop-words 仓库的两种格式：
 *  - 每行一词（广告.txt / 涉枪... / stopword.dic）
 *  - 逗号分隔（色情类.txt / 政治类.txt，含中文逗号、顿号）
 * 也兼容换行/分号混排。返回去重后的原词，最多 20 万条。
 */
export function parseSensitiveWords(text: string): string[] {
  const clean = String(text || '').replace(/^\uFEFF/, '');
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of clean.split(/[\r\n,，、;；]+/)) {
    const word = part.trim();
    if (!word) continue;
    if (word.startsWith('#')) continue; // 注释行
    if (word.length > 80) continue; // 防单条超长（网址文件按行，正常不会超）
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(word);
    if (out.length >= 200000) break;
  }
  return out;
}

/**
 * 修复 multipart 中文文件名乱码。
 * busboy 把 UTF-8 文件名按 latin1 解码后，JS 字符串里会出现 è¯ 这类“每个字节一个字符”的形态；
 * 这种字符串的码点全部 <= 0xFF，可以按 latin1 取回原始字节再按 UTF-8 解码。
 * 真正的 UTF-8 文件名含中文（码点 > 0xFF）或 Latin1 重音字符解码会失败，均保持原样。
 */
export function normalizeUploadFilename(name: string | null | undefined): string {
  let s = String(name || '').split(/[\\/]/).pop() || '未命名.txt';
  s = s.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 255);
  if (!s) return '未命名.txt';
  if ([...s].every((ch) => (ch.codePointAt(0) ?? 0) <= 0xff)) {
    const decoded = Buffer.from(s, 'latin1').toString('utf8');
    if (decoded && !decoded.includes('\uFFFD')) s = decoded;
  }
  return s.slice(0, 255);
}
