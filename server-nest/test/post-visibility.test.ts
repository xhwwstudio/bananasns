import { describe, expect, test } from 'vitest';
import { canViewPost, visibilityWhere, feedVisibilityWhere } from '../src/common/post-visibility';

describe('canViewPost 动态可见范围', () => {
  const base = { visibility: 'public', authorId: 1, viewerId: null as number | null };

  test('公开 / 密码 / 付费 / 匿名：所有人可见（内容锁由 serializePost 处理）', () => {
    for (const v of ['public', 'password', 'paid', 'anonymous']) {
      expect(canViewPost({ ...base, visibility: v })).toBe(true);
      expect(canViewPost({ ...base, visibility: v, viewerId: 2 })).toBe(true);
    }
  });

  test('私密：仅作者', () => {
    expect(canViewPost({ ...base, visibility: 'private', viewerId: 1 })).toBe(true);
    expect(canViewPost({ ...base, visibility: 'private', viewerId: 2 })).toBe(false);
    expect(canViewPost({ ...base, visibility: 'private', viewerId: null })).toBe(false);
  });

  test('仅关注我：作者 / 关注者可见，游客和非关注者不可见', () => {
    const p = { ...base, visibility: 'followers' };
    expect(canViewPost({ ...p, viewerId: 1 })).toBe(true);
    expect(canViewPost({ ...p, viewerId: 2, viewerFollowsAuthor: true })).toBe(true);
    expect(canViewPost({ ...p, viewerId: 2, viewerFollowsAuthor: false })).toBe(false);
    expect(canViewPost({ ...p, viewerId: null })).toBe(false);
  });

  test('登录用户可见：登录即可，游客不可见', () => {
    const p = { ...base, visibility: 'login' };
    expect(canViewPost({ ...p, viewerId: 2 })).toBe(true);
    expect(canViewPost({ ...p, viewerId: null })).toBe(false);
  });

  test('未知值按公开处理（兼容旧数据）', () => {
    expect(canViewPost({ ...base, visibility: 'legacy' })).toBe(true);
  });
});

describe('visibilityWhere 列表 SQL 条件', () => {
  test('游客：排除 private / followers / login', () => {
    const w = visibilityWhere(null);
    expect(w.sql).toContain("NOT IN ('private','followers','login')");
    expect(w.params).toEqual({});
  });

  test('登录用户：允许 login，followers 需关注关系', () => {
    const w = visibilityWhere(7);
    expect(w.sql).toContain("p.visibility <> 'private'");
    expect(w.sql).toContain('following_id');
    expect(w.params).toEqual({ viewerId: 7 });
  });

  test('信息流游客：保留 login 做登录引导 teaser，仍排除 private/followers', () => {
    const w = feedVisibilityWhere(null);
    expect(w.sql).toBe("p.visibility NOT IN ('private','followers')");
    expect(w.params).toEqual({});
    // 登录用户的信息流条件与普通列表一致
    expect(feedVisibilityWhere(7)).toEqual(visibilityWhere(7));
  });
});
