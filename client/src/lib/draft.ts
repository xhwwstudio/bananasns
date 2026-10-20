// Structured draft persisted in localStorage so an unsent post/thread (text + title + images + poll +
// visibility + location) survives navigation / reload / accidental close. Older drafts were a plain
// text string — loadDraft() still reads those for backward compatibility.
//
// 支持多个发布器：无 key = 动态 Composer 的默认草稿（键 banana_draft，向后兼容）；传 key（如 'thread'）
// = 各自独立的草稿槽（键 banana_draft_<key>）。

export interface Draft {
  content?: string;
  title?: string; // 帖子草稿用（动态没有标题）
  media?: any[];
  vis?: string;
  poll?: any;
  location?: string;
}

const BASE_KEY = 'banana_draft';
const keyOf = (key?: string) => (key ? `${BASE_KEY}_${key}` : BASE_KEY);

function nonEmpty(d: Draft | null): boolean {
  return !!(d && (d.content?.trim() || d.title?.trim() || (d.media && d.media.length) || d.poll));
}

export function loadDraft(key?: string): Draft | null {
  try {
    const raw = localStorage.getItem(keyOf(key));
    if (!raw) return null;
    if (raw[0] !== '{') return { content: raw }; // legacy plain-text draft
    return JSON.parse(raw);
  } catch { return null; }
}

// Persist the draft; removes it when there's nothing worth keeping. Returns true if something was saved.
export function saveDraft(d: Draft, key?: string): boolean {
  try {
    if (!nonEmpty(d)) { localStorage.removeItem(keyOf(key)); return false; }
    localStorage.setItem(keyOf(key), JSON.stringify(d));
    return true;
  } catch { return false; }
}

export function clearDraft(key?: string): void {
  try { localStorage.removeItem(keyOf(key)); } catch { /* ignore */ }
}

export function hasDraft(key?: string): boolean {
  return nonEmpty(loadDraft(key));
}
