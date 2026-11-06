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
