/**
 * 动态可见范围。纯函数，前后端字段口径统一在这里（后端强制、前端只做展示）。
 * public    公开
 * private   私密（仅作者）
 * password  密码可见（内容锁，但帖子本身公开）
 * paid      付费可见（内容锁，但帖子本身公开）
 * anonymous 匿名（作者匿名，内容公开）
 * followers 仅关注我（作者 + 关注作者的登录用户）
 * login     登录用户可见（任何登录用户，游客不可见）
 */
export type PostVisibility =
  | 'public'
  | 'private'
  | 'password'
  | 'paid'
  | 'anonymous'
  | 'followers'
  | 'login';

export function canViewPost(opts: {
  visibility: string;
  authorId: number;
  viewerId: number | null;
  viewerFollowsAuthor?: boolean;
}): boolean {
  const { visibility, authorId, viewerId, viewerFollowsAuthor = false } = opts;
  if (viewerId != null && viewerId === authorId) return true;
  switch (visibility) {
    case 'private':
      return false;
    case 'followers':
      return viewerId != null && viewerFollowsAuthor;
    case 'login':
      return viewerId != null;
    default:
      return true;
  }
}

/**
 * 列表查询用的 SQL 条件（别名固定为 p）。viewer 未登录时连 login / followers 一起排除；
 * 登录用户：private 永不出现在公共列表，followers 仅作者本人或关注者可见，login 正常可见。
 */
export function visibilityWhere(viewerId: number | null): { sql: string; params: Record<string, any> } {
  if (viewerId == null) {
    return {
      sql: "p.visibility NOT IN ('private','followers','login')",
      params: {},
    };
  }
  return {
    sql:
      "p.visibility <> 'private' AND (p.visibility <> 'followers' OR p.user_id = :viewerId OR p.user_id IN (SELECT following_id FROM follows WHERE follower_id = :viewerId))",
    params: { viewerId },
  };
}
