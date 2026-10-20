import { describe, expect, test, beforeEach } from 'vitest';
// 从 server-nest vitest 相对 import 前端草稿持久化纯逻辑（不给 client 加测试运行时）。
// draft.ts 让「未发送的动态」(正文/图片/投票…) 跨导航/刷新存活于 localStorage，并向后兼容旧的纯文本草稿。
import { loadDraft, saveDraft, clearDraft, hasDraft } from '../../client/src/lib/draft';

// 简易内存版 localStorage（node 环境无此全局）；每例重置，隔离。
beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
});

describe('composer draft persistence', () => {
  test('空态：loadDraft→null，hasDraft→false', () => {
    expect(loadDraft()).toBeNull();
    expect(hasDraft()).toBe(false);
  });

  test('保存有正文的草稿 → true，可原样读回，hasDraft→true', () => {
    expect(saveDraft({ content: '写了一半的动态', vis: 'public' })).toBe(true);
    expect(loadDraft()).toEqual({ content: '写了一半的动态', vis: 'public' });
    expect(hasDraft()).toBe(true);
  });

  test('保存空草稿({}) → false 并清除；纯空白正文也视为空', () => {
    expect(saveDraft({})).toBe(false);
    expect(hasDraft()).toBe(false);
    expect(saveDraft({ content: '   \n  ' })).toBe(false);
    expect(hasDraft()).toBe(false);
  });

  test('仅图片 / 仅投票也算非空（内容判定 = 正文 || 图片 || 投票）', () => {
    expect(saveDraft({ media: [{ url: 'a.jpg' }] })).toBe(true);
    expect(saveDraft({ poll: { options: ['A', 'B'] } })).toBe(true);
    // 仅 vis/location 不含实质内容 → 空
    expect(saveDraft({ vis: 'public', location: '杭州' })).toBe(false);
  });

  test('从非空→空再次保存时会移除旧草稿（不残留）', () => {
    expect(saveDraft({ content: 'x' })).toBe(true);
    expect(hasDraft()).toBe(true);
    expect(saveDraft({ content: '' })).toBe(false);
    expect(loadDraft()).toBeNull();
  });

  test('clearDraft 清除草稿', () => {
    saveDraft({ content: 'x' });
    clearDraft();
    expect(loadDraft()).toBeNull();
    expect(hasDraft()).toBe(false);
  });

  test('向后兼容：旧的纯文本草稿(非 { 开头)读作 { content }', () => {
    (globalThis as any).localStorage.setItem('banana_draft', '这是旧版纯文本草稿');
    expect(loadDraft()).toEqual({ content: '这是旧版纯文本草稿' });
    expect(hasDraft()).toBe(true);
  });

  test('损坏的 JSON(以 { 开头但非法) → loadDraft 容错返回 null', () => {
    (globalThis as any).localStorage.setItem('banana_draft', '{坏的:json,');
    expect(loadDraft()).toBeNull();
  });
});

// v4.48/v4.49：可带 key 的独立草稿槽（帖子 'thread' / 回答 'answer_<id>'）+ title 字段。
describe('keyed draft slots (spec 01 §2.4 草稿推广)', () => {
  test('不同 key 的草稿互相隔离，各存各的、互不覆盖', () => {
    expect(saveDraft({ content: '动态草稿' })).toBe(true); // 默认槽
    expect(saveDraft({ title: '帖子标题', content: '帖子正文' }, 'thread')).toBe(true);
    expect(saveDraft({ content: '回答草稿' }, 'answer_1')).toBe(true);
    expect(loadDraft()).toEqual({ content: '动态草稿' });
    expect(loadDraft('thread')).toEqual({ title: '帖子标题', content: '帖子正文' });
    expect(loadDraft('answer_1')).toEqual({ content: '回答草稿' });
    expect(loadDraft('answer_2')).toBeNull(); // 另一题没有草稿
  });

  test('key 落到独立的 localStorage 键（banana_draft_<key>），不污染默认键', () => {
    saveDraft({ content: '回答' }, 'answer_1');
    expect((globalThis as any).localStorage.getItem('banana_draft_answer_1')).not.toBeNull();
    expect((globalThis as any).localStorage.getItem('banana_draft')).toBeNull();
  });

  test('title 计入「非空」判定：仅有标题的帖子草稿也会保存', () => {
    expect(saveDraft({ title: '只写了标题' }, 'thread')).toBe(true);
    expect(hasDraft('thread')).toBe(true);
    expect(loadDraft('thread')).toEqual({ title: '只写了标题' });
    // 标题也是纯空白 → 视为空
    expect(saveDraft({ title: '   ' }, 'thread')).toBe(false);
  });

  test('clearDraft(key) 只清对应槽，不影响别的槽', () => {
    saveDraft({ content: '动态' });
    saveDraft({ content: '帖子' }, 'thread');
    clearDraft('thread');
    expect(loadDraft('thread')).toBeNull();
    expect(loadDraft()).toEqual({ content: '动态' }); // 默认槽仍在
  });

  test('hasDraft(key) 按槽判定', () => {
    saveDraft({ content: '回答' }, 'answer_5');
    expect(hasDraft('answer_5')).toBe(true);
    expect(hasDraft('answer_6')).toBe(false);
    expect(hasDraft()).toBe(false); // 默认槽空
  });
});
