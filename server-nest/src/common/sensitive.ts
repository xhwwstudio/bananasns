/**
 * Lightweight sensitive-content filter, ported from server/src/sensitive.js.
 *
 * 2026-11：除内置词库 + 后台自定义词外，支持后台按文件上传词库（sensitive_word_files）。
 * 词库可能上万条，逐条 includes 会拖慢发帖/评论；这里编译成 Aho-Corasick 自动机，
 * 单次扫描 O(n)，匹配任意位置的敏感词（仍先做空格/符号/大小写归一化）。
 */
const BANNED = [
  // 辱骂 / abuse
  '傻逼', '煞笔', '沙雕逼', '操你', '草你妈', '日你妈', '滚你妈', '妈的逼', 'nmsl', 'smdb', '去死吧', '贱人', '婊子', '王八蛋',
  // 色情 / porn
  '约炮', '一夜情', '裸聊', '黄片', 'av女优', '成人电影', '嫖娼', '卖淫', '色情服务', '性服务', '做爱视频', '情色',
  // 赌博 / gambling
  '赌博网', '网上赌场', '百家乐', '澳门赌场', '六合彩', '时时彩', '私彩',
  // 毒品 / drugs
  '冰毒', '大麻', '摇头丸', '海洛因', '吸毒', '贩毒',
  // 诈骗 / 广告 / scam & spam
  '刷单兼职', '日赚过万', '私聊有偿', '代开发票', '办证刻章', '高炮贷款', '彩票内幕', '稳赚不赔', '加微信领',
  // 政治敏感(泛化占位)
  '反动言论', '颠覆国家', '法轮',
];

const NORMALIZE = (s: string | null | undefined) =>
  (s || '').toLowerCase().replace(/[\s　\-_.*~·]/g, '');

const NORM_BANNED = BANNED.map((w) => ({ raw: w, norm: NORMALIZE(w) }));

interface TrieNode {
  next: Map<string, number>;
  fail: number;
  out: string[];
}

let _enabled = true; // sensitive_enabled，默认开
let _signature = '';
let _root: TrieNode[] = [];
let _customRaw: string | null = null;
let _customWords: string[] = [];

function buildMatcher(entries: { raw: string; norm: string }[]): TrieNode[] {
  const nodes: TrieNode[] = [{ next: new Map(), fail: 0, out: [] }];
  const seen = new Set<string>();
  for (const { raw, norm } of entries) {
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    let cur = 0;
    for (const ch of norm) {
      let nxt = nodes[cur].next.get(ch);
      if (nxt == null) {
        nxt = nodes.length;
        nodes.push({ next: new Map(), fail: 0, out: [] });
        nodes[cur].next.set(ch, nxt);
      }
      cur = nxt;
    }
    nodes[cur].out.push(raw);
  }
  // BFS 构建失败指针
  const queue: number[] = [];
  for (const child of nodes[0].next.values()) {
    nodes[child].fail = 0;
    queue.push(child);
  }
  for (let i = 0; i < queue.length; i++) {
    const v = queue[i];
    for (const [ch, u] of nodes[v].next) {
      let f = nodes[v].fail;
      while (f && !nodes[f].next.has(ch)) f = nodes[f].fail;
      nodes[u].fail = nodes[f].next.get(ch) ?? 0;
      if (nodes[u].fail === u) nodes[u].fail = 0;
      nodes[u].out.push(...nodes[nodes[u].fail].out);
      queue.push(u);
    }
  }
  return nodes;
}

/** 由 SensitiveService 调用，把 site_config + 启用文件刷进进程内缓存。 */
export function setSensitiveConfig(
  enabledRaw: string | null | undefined,
  wordsRaw: string | null | undefined,
  extraWords: string[] = [],
): void {
  _enabled = (enabledRaw ?? '1') === '1';
  const raw = wordsRaw || '';
  const signature = `${_enabled ? '1' : '0'}|${raw}|${extraWords.join('\u0000')}`;
  if (signature === _signature) return;
  _signature = signature;

  if (raw !== _customRaw) {
    _customRaw = raw;
    _customWords = raw
      .split(/[\n,，、;；\s]+/)
      .map((w) => w.trim())
      .filter(Boolean);
  }

  const entries = [
    ...NORM_BANNED,
    ..._customWords.map((w) => ({ raw: w, norm: NORMALIZE(w) })),
    ...extraWords.map((w) => ({ raw: w, norm: NORMALIZE(w) })),
  ];
  _root = buildMatcher(entries);
}

/** Returns the first matched banned word, or null if clean. 后台总开关可关闭。 */
export function checkSensitive(text: string | null | undefined): string | null {
  if (!text) return null;
  if (!_enabled) return null; // 后台关闭敏感词过滤
  if (!_root.length) return null;
  const t = NORMALIZE(text);
  if (!t) return null;
  let state = 0;
  for (const ch of t) {
    while (state && !_root[state].next.has(ch)) state = _root[state].fail;
    state = _root[state].next.get(ch) ?? 0;
    if (state && _root[state].out.length) return _root[state].out[0];
  }
  return null;
}

/** 测试/诊断用：当前自动机节点数。 */
export function sensitiveMatcherSize(): number {
  return _root.length;
}
