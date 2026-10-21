# BananaSNS REST API Reference

BananaSNS is a NestJS + MySQL/MariaDB social network backend. This document covers the HTTP endpoints exposed under the API base path.

> 下文各分节给出主要接口的请求 / 响应细节。文末的 [附录 · 完整接口清单](#full-endpoint-index) 由脚本从源码 controller 自动提取，**覆盖全部 30 个模块、206 个 handler**（205 业务 + 1 健康检查），用于确保接口文档与代码零漂移。

## Conventions

- **Base URL:** `/api` — every path below is mounted under it (e.g. `POST /api/auth/login`).
- **Content type:** JSON throughout. Request bodies are JSON (`Content-Type: application/json`); the only exception is `POST /api/upload`, which takes `multipart/form-data`. Responses are JSON.
- **Auth scheme:** `Authorization: Bearer <JWT>`. Obtain a token from `POST /api/auth/register` or `POST /api/auth/login` (the token lives 30 days). Send it on every request that needs identity.
- **Auth tags used below:**
  - **Public** — no token required (a token, if present, may personalize the response, e.g. `liked`/`isFollowing` flags).
  - **Auth** — a valid token is required; otherwise `401 { "error": "请先登录" }`.
  - **Admin** — requires a valid token whose user has `role === 'admin'`; otherwise `403`. Some modules gate inline (`req.user.role !== 'admin'`); the `admin` module gates its whole router via `requireAuth` + `requireAdmin`.
- **User object:** Endpoints returning a user emit a `publicUser` shape: `id, username, nickname, avatar, cover, bio, gender, location, verified, verifiedNote, vip, role, banned, title, avatarFrame, points, experience, balance, level, levelProgress, checkinStreak, lastCheckin, createdAt, followers, following, postCount, isFollowing`. The password hash is never exposed.
- **Errors:** Non-2xx responses are `{ "error": "<message>" }` (messages are in Chinese). Common codes: `400` invalid input, `401` not logged in, `402` insufficient points, `403` forbidden, `404` not found, `409` conflict.
- **Health check:** `GET /api/health` → `{ ok: true, app: "BananaSNS" }` (Public).
- **Static files:** uploaded media is served from `/uploads/<filename>` (outside `/api`).

## Table of Contents

- [Auth](#auth) — `/api/auth`
- [Users](#users) — `/api/users`
- [Posts](#posts) — `/api/posts`
- [Comments](#comments) — `/api/comments`
- [Forum](#forum) — `/api/forum`
- [Messages](#messages) — `/api/messages`
- [Notifications](#notifications) — `/api/notifications`
- [Topics](#topics) — `/api/topics`
- [Upload](#upload) — `/api/upload`
- [Search](#search) — `/api/search`
- [Admin](#admin) — `/api/admin`
- [Mall](#mall) — `/api/mall`
- [Reports](#reports) — `/api/reports`
- [Feedback](#feedback) — `/api/feedback`
- [Flash](#flash) — `/api/flash`
- [Circles](#circles) — `/api/circles`
- [Q&A](#qa) — `/api/qa`
- [Achievements](#achievements) — `/api/achievements`
- [Nav](#nav) — `/api/nav`
- [Site](#site) — `/api/site`
- [Pay](#pay) — `/api/pay`
- [Events](#events) — `/api/events`
- [Articles](#articles) — `/api/articles`
- [Collections](#collections) — `/api/collections`
- [附录 · 完整接口清单](#full-endpoint-index) — 自动生成，覆盖全部 30 模块 / 206 handler

---

## Auth

User accounts, sessions, sign-in, and account-card actions.

### `POST /api/auth/register`
Create an account and return a session token. **Auth:** Public.
- Body: `username` (required, 2–20 chars of letters/digits/underscore/Chinese), `password` (required, ≥6 chars), `nickname` (optional, defaults to username).
- Response: `{ token, user }`. Existing username → `409`.

### `POST /api/auth/login`
Authenticate and return a session token. **Auth:** Public.
- Body: `username`, `password`.
- Response: `{ token, user }`. Wrong credentials → `401`; banned accounts → `403`.

### `GET /api/auth/me`
Return the current authenticated user. **Auth:** Auth.
- Response: `{ user }`.

### `POST /api/auth/password`
Change the account password. **Auth:** Auth.
- Body: `oldPassword`, `newPassword` (≥6 chars).
- Response: `{ ok: true }`.

### `POST /api/auth/checkin`
Daily sign-in / 签到 (awards points + experience; tracks streak). **Auth:** Auth.
- Body: none.
- Response: `{ ok: true, streak, pointsEarned, expEarned, user }`. Already checked in today → `400`.

### `POST /api/auth/change-username`
Rename the account, consuming one unused 改名卡 (mall item with payload `rename`). **Auth:** Auth.
- Body: `username` (new handle, same charset rules as register).
- Response: `{ ok: true, user }`. No rename card → `403`; name taken → `409`.

---

## Users

Profiles, follow/block graph, leaderboards, wallet.

### `GET /api/users/mention`
@-mention autocomplete lookup. **Auth:** Public.
- Query: `q` (prefix/substring).
- Response: `{ users: [...] }` (up to 6).

### `GET /api/users/me/bookmarks`
The viewer's bookmarked posts / 我的收藏. **Auth:** Auth.
- Response: `{ posts: [...] }`.

### `POST /api/users/:id/block`
Toggle block on a user (also removes mutual follows). **Auth:** Auth.
- Response: `{ blocked: true|false }`. Cannot block self (`400`).

### `GET /api/users/me/blocks`
The viewer's block list / 黑名单. **Auth:** Auth.
- Response: `{ users: [...] }`.

### `GET /api/users/:id/blocked`
Whether the viewer is blocking the given user. **Auth:** Auth.
- Response: `{ blocked }`.

### `GET /api/users/ranking/checkin`
Check-in streak leaderboard (top 10). **Auth:** Public.
- Response: `{ users: [...] }`.

### `GET /api/users/ranking/:type`
Leaderboard by `type`: `wealth` (财富/points), `level` (等级/experience), `fans` (人气/followers), `checkin` (签到). **Auth:** Public.
- Response: `{ users: [...] }` (top 50). Unknown type → `400`.

### `GET /api/users/suggestions`
Suggested users to follow (not yet followed). **Auth:** Public.
- Response: `{ users: [...] }` (up to 6).

### `GET /api/users/:username`
Profile by username (falls back to nickname). **Auth:** Public.
- Response: `{ user }`. Unknown → `404`.

### `GET /api/users/:username/:rel`
Follower / following list, where `:rel` is `followers` or `following`. **Auth:** Public.
- Response: `{ users: [...] }`.

### `POST /api/users/:id/follow`
Toggle follow/unfollow a user. **Auth:** Auth.
- Response: `{ following: true|false, user }`. Cannot follow self (`400`).

### `PUT /api/users/me/profile`
Update own profile. **Auth:** Auth.
- Body (all optional, COALESCE-merged): `nickname`, `bio`, `gender`, `location`, `avatar`, `cover`, `verifiedNote`.
- Response: `{ user }`.

### `POST /api/users/me/recharge`
Demo wallet recharge; optionally activate/extend VIP. **Auth:** Auth.
- Body: `amount` (0–100000), `vip` (boolean — adds one month of VIP).
- Response: `{ user }`.

---

## Posts

Feed, single posts, polls, likes, shares, paid/password unlock, rewards, pins, bookmarks.

### `GET /api/posts`
Paginated feed. **Auth:** Public (personalized when authed).
- Query: `filter` (`all` default, `following`, `video`, `samecity`, `recommend`), `limit` (1–30, default 12), `offset`.
- Response: `{ posts: [...], hasMore }`. Blocked users are filtered out. Visibility is enforced per viewer: guests never see `private` / `followers` / `login`; logged-in users see `login`, while `followers` is limited to the author and users who follow the author.

### `GET /api/posts/:id`
Single post (increments view count). **Auth:** Public.
- Response: `{ post }`. Not visible → `403` (private / followers-only / login-only); missing → `404`.

### `GET /api/posts/:id/related`
Related posts (same topic, then same author). **Auth:** Public.
- Response: `{ posts: [...] }` (up to 5), filtered by the same visibility rules.

### `GET /api/posts/:id/siblings`
Previous/next post by the same author (timeline nav). **Auth:** Public.
- Response: `{ prev, next }` (each `{ id, content }` or `null`).

### `POST /api/posts`
Create a post. **Auth:** Auth.
- Body: `content`, `media` (array), `mediaType` (`text`/`image`/`video`, default `text`), `visibility` (`public`/`followers`/`login`/`paid`/`password`/`private`/`anonymous`), `password` (for password posts), `price` (for paid posts), `location`, `device` (default `电脑端`), `topic` (name; also parsed from `#...#` in content), `circleId` (must be a circle the user joined), `poll` (`{ options: [], multi, days }`; 2–6 options), `sourceUrl` (optional, `http(s)://`), `sourceAuthor` (optional, requires `sourceUrl`).
- Response: `{ post }`; a source is returned as `source: { url, author }` or `null`.

### `POST /api/posts/:id/vote`
Vote on the post's attached poll. **Auth:** Auth.
- Body: `optionIds` (array) or `optionId` (single). Single-choice polls use the first.
- Response: `{ poll }`. Errors if no poll (`404`), poll closed, already voted, or no valid selection (`400`).

### `POST /api/posts/:id/share`
Share / repost a post. **Auth:** Auth.
- Body: `content` (optional comment).
- Response: `{ post }` (the new share post).

### `POST /api/posts/:id/like`
Toggle like on a post. **Auth:** Auth.
- Response: `{ liked, likeCount }`.

### `POST /api/posts/:id/unlock`
Unlock a paid post (spends points) or verify a password post. **Auth:** Auth.
- Body: `password` (for password posts).
- Response: `{ post }` (paid), or `{ post, bypass: true, content, media }` (password). `402` insufficient points; `403` wrong password.

### `POST /api/posts/:id/reward`
Tip / 打赏 the post author with points. **Auth:** Auth.
- Body: `amount` (1–9999).
- Response: `{ ok: true }`. `402` insufficient points; cannot reward self (`400`).

### `PUT /api/posts/:id`
Edit own post. **Auth:** Auth (owner).
- Body (optional): `content`, `media`, `visibility`, `price`.
- Response: `{ post }`. Not owner → `403`.

### `POST /api/posts/:id/pin`
Toggle pin on own post (only one pinned per user). **Auth:** Auth (owner).
- Response: `{ pinned }`.

### `POST /api/posts/:id/global-pin`
Toggle site-wide pin / 全站置顶 for 24h, consuming a 全站置顶卡 (payload `pin`). **Auth:** Auth (owner).
- Response: `{ globalPinned, until }` (or `{ globalPinned: false }` when un-pinning). No pin card → `403`.

### `POST /api/posts/:id/bookmark`
Toggle bookmark / 收藏. **Auth:** Auth.
- Response: `{ bookmarked }`.

### `DELETE /api/posts/:id`
Delete a post. **Auth:** Auth (owner or admin).
- Response: `{ ok: true }`.

### `GET /api/posts/user/:username`
Posts by a user (profile feed, pinned first). **Auth:** Public.
- Response: `{ posts: [...] }`.

### `GET /api/posts/liked/:username`
Posts a user has liked (profile 赞过 tab). **Auth:** Public.
- Response: `{ posts: [...] }`.

---

## Comments

Comments and replies on posts and forum threads.

### `GET /api/comments`
List comments as a nested tree. **Auth:** Public.
- Query: `postId` or `threadId` (one required), `sort` (`latest` default, `hot`).
- Response: `{ comments: [...] }` with nested `replies`.

### `POST /api/comments`
Add a comment or reply. **Auth:** Auth.
- Body: `postId` or `threadId` (one required), `parentId` (optional), `replyTo` (optional user id), `content`.
- Response: `{ comment }`.

### `POST /api/comments/:id/like`
Toggle like on a comment. **Auth:** Auth.
- Response: `{ liked, likeCount }`.

### `DELETE /api/comments/:id`
Delete a comment. **Auth:** Auth (owner or admin).
- Response: `{ ok: true }`.

---

## Forum

Boards, threads, board follows, moderation.

### `GET /api/forum/boards`
List top-level boards with nested children. **Auth:** Public.
- Response: `{ boards: [...] }`.

### `GET /api/forum/my-boards`
Boards the viewer follows. **Auth:** Auth.
- Response: `{ boards: [...] }`.

### `POST /api/forum/boards/:id/follow`
Toggle follow on a board. **Auth:** Auth.
- Response: `{ following }`.

### `GET /api/forum/boards/:slug`
A board plus its threads (and child-board threads). **Auth:** Public.
- Query: `sort` (`latest` default, `hot`, `elite`).
- Response: `{ board, threads: [...] }`.

### `GET /api/forum/threads`
Recent threads across all boards. **Auth:** Public.
- Query: `sort` (`latest` default, `hot`, `elite`).
- Response: `{ threads: [...] }`.

### `GET /api/forum/threads/user/:username`
Threads authored by a user. **Auth:** Public.
- Response: `{ threads: [...] }`.

### `GET /api/forum/threads/:id`
Single thread (increments views, full content). **Auth:** Public.
- Response: `{ thread }`.

### `POST /api/forum/threads`
Create a thread. **Auth:** Auth.
- Body: `boardId`, `title`, `content`, `media` (array, optional).
- Response: `{ thread }`.

### `POST /api/forum/threads/:id/like`
Toggle like on a thread. **Auth:** Auth.
- Response: `{ liked, likeCount }`.

### `PUT /api/forum/threads/:id`
Edit own thread. **Auth:** Auth (owner).
- Body (optional): `title`, `content`.
- Response: `{ thread }`.

### `POST /api/forum/threads/:id/moderate`
Moderate a thread. **Auth:** Auth — `delete` allowed for owner or moderator; `pin`/`elite`/`lock` require a board moderator (admins are moderators everywhere).
- Body: `action` (`pin`, `elite`, `lock`, `delete`).
- Response: `{ ok: true, deleted: true }` or `{ ok: true, <pinned|elite|locked>: bool }`.

---

## Messages

Private one-to-one direct messages.

### `GET /api/messages`
Conversation list (latest message + unread count per peer, pinned first). **Auth:** Auth.
- Response: `{ conversations: [...] }` — each `{ peer, last, unread, pinned, muted }`.

### `GET /api/messages/unread`
Total unread DM count for the navbar badge (muted peers excluded). **Auth:** Auth.
- Response: `{ unread }`.

### `POST /api/messages/:peerId/settings`
Set per-conversation pin / mute preferences. **Auth:** Auth.
- Body: `pinned` (boolean), `muted` (boolean) — either optional.
- Response: `{ pinned, muted }`.

### `GET /api/messages/:peerId`
Conversation thread with a peer (marks incoming messages read). **Auth:** Auth.
- Response: `{ peer, messages: [...] }` (up to 200).

### `DELETE /api/messages/:peerId`
Delete the entire conversation with a peer. **Auth:** Auth.
- Response: `{ ok: true }`.

### `POST /api/messages/:peerId`
Send a message. **Auth:** Auth.
- Body: `content`, `type` (`text` default, `image`).
- Response: `{ message }`. Peer missing → `404`.

---

## Notifications

In-app notification inbox.

### `GET /api/notifications`
List notifications (newest first, up to 100). **Auth:** Auth.
- Response: `{ notifications: [...] }` — each `{ id, type, targetType, targetId, preview, read, createdAt, actor }`.

### `GET /api/notifications/unread`
Unread notification count. **Auth:** Auth.
- Response: `{ unread }`.

### `POST /api/notifications/read`
Mark all notifications read. **Auth:** Auth.
- Response: `{ ok: true }`.

### `POST /api/notifications/:id/read`
Mark a single notification read. **Auth:** Auth.
- Response: `{ ok: true }`.

---

## Topics

Hashtag topics and topic follows.

### `GET /api/topics`
Hot topics, or `?q=` search for autocomplete. **Auth:** Public.
- Query: `q` (optional).
- Response: `{ topics: [...] }`.

### `GET /api/topics/following`
Topics the viewer follows. **Auth:** Auth.
- Response: `{ topics: [...] }`.

### `GET /api/topics/:name`
A topic plus its posts. **Auth:** Public.
- Response: `{ topic, posts: [...] }`. Unknown topic → `404`.

### `POST /api/topics/:name/follow`
Toggle follow on a topic. **Auth:** Auth.
- Response: `{ following }`.

---

## Upload

Media upload for posts, threads, messages, and avatars.

### `POST /api/upload`
Upload up to 9 files. **Auth:** Auth. **Content type:** `multipart/form-data`.
- Form field: `files` (up to 9; image/video/audio only; max 25 MB each).
- Response: `{ files: [{ url, type, name }] }` (`type` is `image`/`video`/`audio`; `url` like `/uploads/<filename>`).

---

## Search

Global and trending search.

### `GET /api/search/trending`
Trending keywords (derived from hot topics). **Auth:** Public.
- Response: `{ keywords: [...] }`.

### `GET /api/search`
Global search across users, posts, threads, topics. **Auth:** Public.
- Query: `q`.
- Response: `{ users: [...], posts: [...], threads: [...], topics: [...] }`. Empty `q` returns empty arrays. (`threads` items are `{ id, title, replyCount }`.)

---

## Admin

Site administration. **The entire `/api/admin` router requires Auth + Admin** (`requireAuth` then `requireAdmin`). Every endpoint below is **Admin**.

### `GET /api/admin/overview`
Site stats, last-7-days activity, recent users.
- Response: `{ stats: { users, posts, threads, comments, topics, boards, reports, vip }, activity: [...], recentUsers: [...] }`.

### `GET /api/admin/users`
Search users (response includes `email`). 
- Query: `q`.
- Response: `{ users: [...] }`.

### `PUT /api/admin/users/:id`
Update a user's flags/fields.
- Body (all optional): `verified`, `vip`, `role`, `banned`, `verifiedNote`, `title`, `points`.
- Response: `{ user }`.

### `POST /api/admin/boards`
Create a board.
- Body: `name`, `slug` (both required), `description`, `icon`, `parentId`, `announcement`, `isPaid`, `price`.
- Response: `{ board }`. Duplicate slug → `409`.

### `PUT /api/admin/boards/:id`
Update a board.
- Body (optional): `name`, `description`, `icon`, `announcement`, `isPaid`, `price`, `sort`.
- Response: `{ ok: true }`.

### `DELETE /api/admin/boards/:id`
Delete a board.
- Response: `{ ok: true }`.

### `POST /api/admin/boards/:id/moderators`
Toggle a user as moderator of a board.
- Body: `username` (username or nickname).
- Response: `{ added: true, user }` or `{ added: false }`.

### `POST /api/admin/topics`
Create a topic.
- Body: `name` (required), `description`.
- Response: `{ topic }`. Duplicate → `409`.

### `DELETE /api/admin/topics/:id`
Delete a topic.
- Response: `{ ok: true }`.

### `GET /api/admin/reports`
List open reports with target previews.
- Response: `{ reports: [...] }` — each `{ id, targetType, targetId, reason, createdAt, reporter, target }`.

### `POST /api/admin/reports/:id/resolve`
Mark a report resolved.
- Response: `{ ok: true }`.

### `POST /api/admin/products`
Create a mall product.
- Body: `name`, `price` (both required), `description`, `icon`, `category`, `payload`, `stock` (-1 = unlimited).
- Response: `{ product }`.

### `DELETE /api/admin/products/:id`
Delete a product.
- Response: `{ ok: true }`.

### `DELETE /api/admin/content/:type/:id`
Delete content of `:type` (`post`, `thread`, `comment`).
- Response: `{ ok: true }`. Unknown type → `400`.

### `GET /api/admin/config`
Read site settings stored in the generic `site_config` key/value table (modules, appearance, security, and per-page layout keys such as `layout_<page>`).
- Response: `{ config: { ... } }`.

### `PUT /api/admin/config`
Upsert one or more site settings. Values are persisted in `site_config` (no DB migration needed).
- Body: `{ config: { ... } }` — e.g. `{ config: { layout_mall: 'wide' } }` (layout values: `default` | `wide` | `narrow`).
- Response: `{ ok: true }`.

---

## Mall

Points store, orders, and inventory.

### `GET /api/mall/products`
List products (cheapest first; `owned`/`soldOut` flags personalized when authed). **Auth:** Public.
- Response: `{ products: [...] }` — each `{ id, name, description, icon, category, payload, price, stock, sold, owned, soldOut }`.

### `GET /api/mall/orders`
The viewer's orders. **Auth:** Auth.
- Response: `{ orders: [...] }`.

### `GET /api/mall/inventory`
Unused consumable items grouped by payload, e.g. `{ rename: 1 }`. **Auth:** Auth.
- Response: `{ inventory }`.

### `POST /api/mall/products/:id/redeem`
Redeem a product with points (equips title/frame immediately for those categories). **Auth:** Auth.
- Response: `{ ok: true, user }`. `402` insufficient points; `400` sold out or already owned (non-`item` categories).

---

## Reports

Submit content/user reports (reviewed in the Admin module).

### `POST /api/reports`
Report a target. **Auth:** Auth.
- Body: `targetType` (`post`, `thread`, `comment`, `user`), `targetId`, `reason` (optional).
- Response: `{ ok: true }`. Invalid type/target → `400`.

---

## Feedback

User feedback board (问题反馈).

### `POST /api/feedback`
Submit feedback. **Auth:** Auth.
- Body: `content` (≥5 chars).
- Response: `{ ok: true, id }`.

### `GET /api/feedback`
List feedback (newest first, up to 100). **Auth:** Public.
- Query: `status` (optional; one of `open`, `planned`, `doing`, `resolved`, `closed`).
- Response: `{ feedback: [...] }` — each `{ id, content, status, reply, repliedAt, createdAt, user }`.

### `POST /api/feedback/:id/reply`
Reply to / set status of a feedback item. **Auth:** Admin (gated inline by `req.user.role !== 'admin'`).
- Body: `reply`, `status` (one of the five statuses; defaults to `resolved`).
- Response: `{ ok: true }`.

---

## Flash

News flash / 资讯快报 ticker.

### `GET /api/flash`
List flash items (pinned first, newest first). **Auth:** Public.
- Query: `limit` (1–50, default 30), `category` (optional filter).
- Response: `{ flash: [...] }` — each `{ id, title, summary, category, url, pinned, createdAt }`.

### `POST /api/flash`
Publish a flash item. **Auth:** Admin (gated inline).
- Body: `title` (required), `summary`, `category` (default `动态`), `url`, `pinned`.
- Response: `{ ok: true, id }`.

---

## Circles

Interest circles / 圈子 — communities users join and post into.

### `GET /api/circles`
List circles. **Auth:** Public (personalized `joined` when authed).
- Query: `sort` (`hot` default, `new`), `category` (optional), `mine` (`1` → only the viewer's joined circles, requires auth).
- Response: `{ circles: [...] }` — each `{ id, name, slug, description, category, color, icon, cover, memberCount, postCount, createdAt, owner, joined }`.

### `GET /api/circles/suggestions`
Suggested active circles the viewer hasn't joined (up to 5). **Auth:** Public.
- Response: `{ circles: [...] }`.

### `GET /api/circles/:slug`
Circle detail by slug or numeric id, with a sample of members. **Auth:** Public.
- Response: `{ circle, members: [...] }` (up to 12 members). Not found → `404`.

### `GET /api/circles/:slug/posts`
Circle feed (pinned first, newest first). **Auth:** Public.
- Query: `limit` (1–30, default 20), `offset`.
- Response: `{ posts: [...] }`.

### `POST /api/circles`
Create a circle (creator becomes owner + first member). **Auth:** Auth.
- Body: `name` (required, ≤24 chars), `description` (≤200), `category` (default `兴趣`), `color`, `icon` (default `circle`).
- Response: `{ circle }`.

### `POST /api/circles/:id/join`
Join a circle. **Auth:** Auth.
- Response: `{ joined: true, memberCount }`.

### `POST /api/circles/:id/leave`
Leave a circle. **Auth:** Auth.
- Response: `{ joined: false, memberCount }`. The owner cannot leave (`400`).

---

## Q&A

Question-and-answer board with point bounties / 问答悬赏.

### `GET /api/qa`
List questions. **Auth:** Public.
- Query: `status` (`open`, `solved`), `category` (or `全部`), `sort` (`new` default, `hot`, `bounty`).
- Response: `{ questions: [...] }` — each `{ id, title, excerpt, category, bounty, status, bestAnswerId, answerCount, viewCount, createdAt, isAsker, author }`.

### `GET /api/qa/spotlight`
A few open, high-bounty questions for the sidebar (up to 5). **Auth:** Public.
- Response: `{ questions: [...] }`.

### `GET /api/qa/:id`
Question detail (increments views) with answers (accepted first, then by votes). **Auth:** Public.
- Response: `{ question, answers: [...] }`. Question includes full `body`; answers are `{ id, content, voteCount, accepted, createdAt, voted, author }`.

### `POST /api/qa`
Ask a question; bounty (if any) is escrowed from the asker's points. **Auth:** Auth.
- Body: `title` (required, ≤60 chars), `body` (≤2000), `category` (default `综合`), `bounty` (0–9999).
- Response: `{ question }`. `402` if insufficient points for the bounty.

### `POST /api/qa/:id/answers`
Answer a question. **Auth:** Auth.
- Body: `content` (≤2000).
- Response: `{ answer }`.

### `POST /api/qa/answers/:id/vote`
Toggle an upvote on an answer. **Auth:** Auth.
- Response: `{ voted, voteCount }`.

### `POST /api/qa/:id/accept/:answerId`
Accept an answer (asker only) — transfers the bounty to the answerer and marks the question solved. **Auth:** Auth (asker).
- Response: `{ ok: true }`. `403` if not the asker; `400` if already solved.

---

## Achievements

Daily/growth tasks, badges, and reward claims. Tasks and badges are computed live from existing data.

### `GET /api/achievements`
Combined achievements for the logged-in user (also persists newly-unlocked badges). **Auth:** Auth.
- Response: `{ tasks: [...], badges: [...], stats, claimablePoints, unlockedCount }`. Each task: `{ key, title, desc, icon, points, target, daily, progress, done, claimed, claimable }`. Each badge: `{ key, name, desc, icon, tier, unlocked, unlockedAt }`.

### `GET /api/achievements/user/:id/badges`
Public badge wall for a profile (no persistence). **Auth:** Public.
- Response: `{ badges: [...], user }`. Unknown user → `404`.

### `POST /api/achievements/claim/:key`
Claim a completed task's point reward. **Auth:** Auth.
- Response: `{ ok: true, points, user }`. `400` if already claimed or task not yet complete; `404` for unknown task key.

---

## Nav

Curated link directory / 导航 (categories and links).

### `GET /api/nav`
Full directory: categories (ordered) each with their links (ordered). **Auth:** Public.
- Response: `{ categories: [{ id, name, icon, links: [{ id, title, url, description, color, clicks }] }] }`.

### `GET /api/nav/popular`
Most-clicked links (sidebar 热门导航, up to 8). **Auth:** Public.
- Response: `{ links: [...] }`.

### `POST /api/nav/:id/click`
Track a click on a link (fire-and-forget). **Auth:** Public.
- Response: `{ ok: true }`.

### `POST /api/nav/categories`
Create a navigation category. **Auth:** Admin (gated inline).
- Body: `name` (required), `icon` (default `compass`), `position`.
- Response: `{ ok: true, id }`.

### `POST /api/nav/links`
Create a navigation link. **Auth:** Admin (gated inline).
- Body: `categoryId`, `title`, `url` (all required), `description`, `color`, `position`.
- Response: `{ ok: true, id }`.

---

## Site

Public site settings (sourced from the `site_config` table; written via the admin config endpoints above).

### `GET /api/site`
Public site configuration consumed by the frontend. **Auth:** Public.
- Response: `{ modules: { ... }, layouts: { ... } }` — `modules` is the enabled-module map; `layouts` maps each page to its layout (`default` | `wide` | `narrow`), read by the frontend `useLayout(key, fallback)`. Also includes `showLanding` (whether anonymous visitors see the welcome/login page) and `allowGuest` (whether the landing page offers guest access).

---

## Pay

<a id="pay"></a>

积分充值支付。三个网关：**易支付**（`epay`，聚合支付宝 / 微信）、**支付宝官方直连**（RSA2）、**微信支付 v3**（Native 扫码）。充值汇率 **1 元 = 100 积分**（`POINTS_PER_YUAN`）；下单金额限 **1–100000 元**。网关凭据在后台「支付」配置，未配置 / 未启用时下单返回 `400`。异步回调（`*/notify`）由网关服务器调用、**无需登录**（靠签名 / 密文验真），到账幂等（重复回调只入账一次）。前台另有「演示充值开关」`demo_recharge_enabled`：开启时可模拟到账免真实支付，关闭后必须走下列真实网关。

### `POST /api/pay/epay/create`
易支付下单。**Auth:** Auth。
- Body: `amount`（元，1–100000，必填）、`channel`（`alipay` | `wxpay`，默认 `alipay`）。
- Response: `{ payUrl, outTradeNo, points, money }` — `payUrl` 为网关收银台地址，前端跳转即可。
- 错误：`400 { "error": "易支付未配置或未启用" }`、`400 { "error": "金额需在 1–100000 元之间" }`。

### `GET|POST /api/pay/epay/notify`
易支付异步回调。**Auth:** Public（网关调用，MD5 验签）。验签 + 金额校验通过后到账（幂等）。返回字面量 `success`（成功）或 `fail`。

### `GET /api/pay/epay/return`
用户支付完成后同步跳回。**Auth:** Public。`302` 重定向到 `/member?recharge=ok`。

### `POST /api/pay/alipay/create`
支付宝官方直连（RSA2，`alipay.trade.page.pay`）下单。**Auth:** Auth。
- Body: `amount`（元，1–100000，必填）。
- Response: `{ payUrl, outTradeNo, points, money }`（`payUrl` 为收银台地址）。

### `POST /api/pay/alipay/notify`
支付宝异步回调（POST 表单）。**Auth:** Public（RSA2 验签 + appid / 金额校验）。成功须返回字面量 `success`（否则支付宝持续重推），失败返回 `fail`；到账幂等。

### `GET /api/pay/alipay/return`
支付宝同步跳回。**Auth:** Public。`302` → `/member?recharge=ok`。

### `POST /api/pay/wechat/create`
微信支付 v3 · Native 扫码下单。**Auth:** Auth。
- Body: `amount`（元，1–100000，必填）。
- Response: `{ codeUrl, outTradeNo, points, money }` — `codeUrl` 为二维码内容，前端渲染成二维码供扫码支付。

### `POST /api/pay/wechat/notify`
微信异步回调（POST JSON，资源体 AES-GCM 加密）。**Auth:** Public（APIv3 密钥解密 + 金额校验）。返回 `{ "code": "SUCCESS" }` 停止重试、`{ "code": "FAIL", "message": "…" }` 触发重推；到账幂等。

### `GET /api/pay/orders`
我的充值订单（近 20 条）。**Auth:** Auth。
- Response: `{ orders: [{ outTradeNo, amount, points, status, channel, createdAt }] }`。`status`：`pending` | `paid`。

### `GET /api/pay/admin/orders`
全部充值订单（近 50 条）+ 汇总。**Auth:** Admin。
- Response: `{ stats: { total, paidCount, paidAmount, paidPoints }, orders: [{ outTradeNo, user: { id, nickname, username } | null, gateway, channel, amount, points, status, createdAt }] }`。

---

## Events

<a id="events"></a>

社区活动 / 报名。分类：聚会 · 讲座 · 运动 · 桌游 · 线上 · 公益。每个活动有 `status`（`upcoming` 未开始 / `ongoing` 进行中 / `ended` 已结束，由开始 / 结束时间计算）。可设名额 `capacity`（0 = 不限）与报名 `fee`（积分，0 = 免费）；报名扣积分、取消退积分。

### `GET /api/events`
活动列表。**Auth:** Public（带 token 可标记「我报名的」）。
- Query: `filter`（`upcoming` 默认 | `past` | `mine`）、`category`（见上）、`q`（标题 / 地点搜索）。
- Response: `{ events: [...], categories: ["聚会", …], counts: { … } }`。

### `GET /api/events/:id`
活动详情 + 报名者。**Auth:** Public。
- Response: `{ event: { …, status, signupCount, capacity, fee, signed, isOrganizer }, attendees: [publicUser…] }`。
- 错误：`404 { "error": "活动不存在或已取消" }`。

### `POST /api/events`
创建活动。**Auth:** Auth（发起人获 +10 经验）。
- Body: `title`（≥2 字，必填）、`startAt`（必填）、`description`、`location`、`category`（默认「聚会」）、`endAt`、`cover`、`capacity`（0–100000，0=不限）、`fee`（积分 0–100000）、`online`（布尔）。标题 / 描述 / 地点过敏感词。
- Response: `{ event: { … } }`。
- 错误：`400`（标题过短 / 未选开始时间 / 含敏感词）。

### `POST /api/events/:id/signup`
报名。**Auth:** Auth。校验：活动未结束、未重复报名、名额未满、积分 ≥ `fee`（收费活动扣 `fee` 积分）。
- Response: `{ ok: true, event: { … }, user: publicUser }`。
- 错误：`400`（已结束 / 已报名 / 名额已满 / 积分不足）、`404`。

### `POST /api/events/:id/cancel`
取消报名（收费活动退回 `fee` 积分）。**Auth:** Auth。
- Response: `{ ok: true, event: { … }, user: publicUser }`。
- 错误：`400 { "error": "你还没有报名" }`、`404`。

### `DELETE /api/events/:id`
删除活动。**Auth:** Auth（仅发起人或管理员）。

### `GET /api/events/admin/stats`
活动运营统计。**Auth:** Admin。
- Response: `{ total, active, ended, totalSignups }`。

---

## Articles

<a id="articles"></a>

专栏文章。分类：综合 · 技术 · 设计 · 产品 · 生活 · 观点。

### `GET /api/articles`
文章列表（首屏附带精选置顶）。**Auth:** Public。
- Query: `category`、`sort`（`hot` 热门 | 默认最新）、`offset`、`limit`（默认 12）、`q`（标题搜索）。
- Response: `{ featured: article | null, articles: [...], categories: [{ name, count }], total, hasMore }`。

### `GET /api/articles/trending`
热门文章（侧栏组件用）。**Auth:** Public。
- Response: `{ articles: [{ id, title, category, views, likeCount }] }`。

### `GET /api/articles/:id`
文章详情 + 相关阅读。**Auth:** Public。
- Response: `{ article: { … }, related: [...] }`。
- 错误：`404 { "error": "文章不存在或已删除" }`。

### `POST /api/articles`
发布文章。**Auth:** Auth（作者获 +12 经验）。
- Body: `title`（≥2 字，必填）、`content`（≥10 字，必填）、`summary`（可选，留空自动取正文前 80 字）、`category`（默认「综合」）、`cover`。标题 / 正文 / 摘要过敏感词。
- Response: `{ article: { … } }`。
- 错误：`400`（标题过短 / 正文过短 / 含敏感词）。

### `POST /api/articles/:id/like`
点赞 / 取消点赞（切换）。**Auth:** Auth。错误：`404`。

### `DELETE /api/articles/:id`
删除文章。**Auth:** Auth（仅作者或管理员）。

### `POST /api/articles/:id/feature`
设为 / 取消精选。**Auth:** Admin。
- Body: `featured`（布尔）。

---

## Collections

<a id="collections"></a>

内容专题 / 合集：把动态、文章归集成一个「专题」。条目类型 `targetType`：`post` | `article`。

### `GET /api/collections`
专题列表。**Auth:** Public。
- Response: `{ collections: [{ id, title, description, itemCount, owner, … }] }`。

### `GET /api/collections/mine`
我的专题（供「加入专题」选择器用）。**Auth:** Auth。
- Response: `{ collections: [...] }`。

### `GET /api/collections/:id`
专题详情 + 条目。**Auth:** Public。
- Response: `{ collection: { … }, items: [post | article …] }`。
- 错误：`404 { "error": "专题不存在" }`。

### `POST /api/collections`
创建专题。**Auth:** Auth。
- Body: `title`（≥2 字，最长 80，必填）、`description`（过敏感词）。
- Response: `{ collection: { … } }`。
- 错误：`400`（标题过短 / 含敏感词）。

### `POST /api/collections/:id/items`
往专题加条目。**Auth:** Auth（仅专题作者）。
- Body: `targetType`（`post` | `article`）、`targetId`。
- 错误：`400`（参数有误）、`403`（非本人专题）、`404`。

### `DELETE /api/collections/:id/items/:itemId`
从专题移除条目。**Auth:** Auth（仅作者）。

### `DELETE /api/collections/:id`
删除专题。**Auth:** Auth（仅作者）。

---

## 附录 · 完整接口清单（自动生成）

<a id="full-endpoint-index"></a>

> 本清单由脚本从 30 个 controller 的路由装饰器自动提取，覆盖全部 **206** 个 HTTP handler（其中 **205** 个业务接口 + 1 个 `GET /api/health` 健康检查）。目的是让文档与代码零漂移；主要接口的请求/响应细节见上文各分节。

**`/api`**

| 方法 | 路径 | Handler |
|---|---|---|
| GET | `/api/health` | `health` |

**`/api/achievements`**

| 方法 | 路径 | Handler |
|---|---|---|
| GET | `/api/achievements` | `overview` |
| GET | `/api/achievements/user/:id/badges` | `userBadgeWall` |
| POST | `/api/achievements/claim/:key` | `claim` |

**`/api/admin`**

| 方法 | 路径 | Handler |
|---|---|---|
| GET | `/api/admin/overview` | `overview` |
| GET | `/api/admin/audit` | `audit` |
| GET | `/api/admin/config` | `getConfig` |
| PUT | `/api/admin/config` | `updateConfig` |
| GET | `/api/admin/users` | `listUsers` |
| PUT | `/api/admin/users/:id` | `updateUser` |
| POST | `/api/admin/users/:id/reset-password` | `resetUserPassword` |
| POST | `/api/admin/boards` | `createBoard` |
| PUT | `/api/admin/boards/:id` | `updateBoard` |
| DELETE | `/api/admin/boards/:id` | `deleteBoard` |
| POST | `/api/admin/boards/:id/moderators` | `toggleModerator` |
| POST | `/api/admin/topics` | `createTopic` |
| PUT | `/api/admin/topics/:id` | `updateTopic` |
| DELETE | `/api/admin/topics/:id` | `deleteTopic` |
| GET | `/api/admin/reports` | `listReports` |
| POST | `/api/admin/reports/:id/resolve` | `resolveReport` |
| POST | `/api/admin/products` | `createProduct` |
| PUT | `/api/admin/products/:id` | `updateProduct` |
| DELETE | `/api/admin/products/:id` | `deleteProduct` |
| DELETE | `/api/admin/content/:type/:id` | `deleteContent` |

**`/api/ai`**

| 方法 | 路径 | Handler |
|---|---|---|
| GET | `/api/ai/status` | `status` |
| GET | `/api/ai/conversations` | `listConversations` |
| POST | `/api/ai/conversations` | `createConversation` |
| GET | `/api/ai/conversations/:id` | `getConversation` |
| DELETE | `/api/ai/conversations/:id` | `deleteConversation` |
| POST | `/api/ai/conversations/:id/messages` | `sendMessage` |
| POST | `/api/ai/conversations/:id/stream` | `stream` |

**`/api/articles`**

| 方法 | 路径 | Handler |
|---|---|---|
| GET | `/api/articles` | `list` |
| GET | `/api/articles/trending` | `trending` |
| GET | `/api/articles/:id` | `detail` |
| POST | `/api/articles` | `create` |
| POST | `/api/articles/:id/like` | `like` |
| DELETE | `/api/articles/:id` | `remove` |
| POST | `/api/articles/:id/feature` | `feature` |

**`/api/auth`**

| 方法 | 路径 | Handler |
|---|---|---|
| POST | `/api/auth/register` | `register` |
| POST | `/api/auth/login` | `login` |
| GET | `/api/auth/me` | `me` |
| POST | `/api/auth/password` | `changePassword` |
| POST | `/api/auth/checkin` | `checkin` |
| POST | `/api/auth/change-username` | `changeUsername` |

**`/api/checkin`**

| 方法 | 路径 | Handler |
|---|---|---|
| GET | `/api/checkin` | `hub` |
| POST | `/api/checkin/makeup` | `makeup` |
| GET | `/api/checkin/admin/stats` | `adminStats` |

**`/api/circles`**

| 方法 | 路径 | Handler |
|---|---|---|
| GET | `/api/circles` | `list` |
| GET | `/api/circles/suggestions` | `suggestions` |
| GET | `/api/circles/admin/stats` | `adminStats` |
| POST | `/api/circles` | `create` |
| GET | `/api/circles/:slug` | `detail` |
| GET | `/api/circles/:slug/posts` | `feed` |
| GET | `/api/circles/:slug/chat` | `chatList` |
| POST | `/api/circles/:slug/chat` | `chatSend` |
| POST | `/api/circles/:id/join` | `join` |
| POST | `/api/circles/:id/leave` | `leave` |
| DELETE | `/api/circles/:id` | `adminRemove` |

**`/api/collections`**

| 方法 | 路径 | Handler |
|---|---|---|
| GET | `/api/collections` | `list` |
| GET | `/api/collections/mine` | `mine` |
| GET | `/api/collections/:id` | `detail` |
| POST | `/api/collections` | `create` |
| POST | `/api/collections/:id/items` | `addItem` |
| DELETE | `/api/collections/:id/items/:itemId` | `removeItem` |
| DELETE | `/api/collections/:id` | `remove` |

**`/api/comments`**

| 方法 | 路径 | Handler |
|---|---|---|
| GET | `/api/comments` | `list` |
| POST | `/api/comments` | `create` |
| POST | `/api/comments/:id/like` | `like` |
| POST | `/api/comments/:id/react` | `react` |
| GET | `/api/comments/:id/reactions` | `reactions` |
| DELETE | `/api/comments/:id` | `remove` |

**`/api/events`**

| 方法 | 路径 | Handler |
|---|---|---|
| GET | `/api/events` | `list` |
| GET | `/api/events/admin/stats` | `adminStats` |
| GET | `/api/events/:id` | `detail` |
| POST | `/api/events` | `create` |
| POST | `/api/events/:id/signup` | `signup` |
| POST | `/api/events/:id/cancel` | `cancel` |
| DELETE | `/api/events/:id` | `remove` |

**`/api/feedback`**

| 方法 | 路径 | Handler |
|---|---|---|
| POST | `/api/feedback` | `create` |
| GET | `/api/feedback` | `list` |
| POST | `/api/feedback/:id/reply` | `reply` |

**`/api/flash`**

| 方法 | 路径 | Handler |
|---|---|---|
| GET | `/api/flash` | `list` |
| POST | `/api/flash` | `create` |
| PUT | `/api/flash/:id` | `update` |
| DELETE | `/api/flash/:id` | `remove` |

**`/api/forum`**

| 方法 | 路径 | Handler |
|---|---|---|
| GET | `/api/forum/boards` | `listBoards` |
| GET | `/api/forum/my-boards` | `myBoards` |
| POST | `/api/forum/boards/:id/follow` | `followBoard` |
| GET | `/api/forum/boards/:slug` | `boardDetail` |
| GET | `/api/forum/threads` | `listThreads` |
| GET | `/api/forum/threads/user/:username` | `threadsByUser` |
| POST | `/api/forum/threads` | `createThread` |
| POST | `/api/forum/threads/:id/like` | `likeThread` |
| POST | `/api/forum/threads/:id/subscribe` | `subscribe` |
| POST | `/api/forum/boards/:id/purchase` | `purchaseBoard` |
| PUT | `/api/forum/threads/:id` | `updateThread` |
| POST | `/api/forum/threads/:id/moderate` | `moderate` |
| GET | `/api/forum/threads/:id` | `threadDetail` |

**`/api/history`**

| 方法 | 路径 | Handler |
|---|---|---|
| GET | `/api/history` | `list` |
| DELETE | `/api/history/:type/:id` | `removeOne` |
| DELETE | `/api/history` | `clear` |

**`/api/lottery`**

| 方法 | 路径 | Handler |
|---|---|---|
| GET | `/api/lottery` | `board` |
| GET | `/api/lottery/winners` | `winners` |
| POST | `/api/lottery/draw` | `draw` |
| GET | `/api/lottery/prizes` | `adminList` |
| POST | `/api/lottery/prizes` | `upsertPrize` |
| DELETE | `/api/lottery/prizes/:id` | `removePrize` |
| GET | `/api/lottery/admin/draws` | `adminDraws` |

**`/api/mall`**

| 方法 | 路径 | Handler |
|---|---|---|
| GET | `/api/mall/products` | `listProducts` |
| GET | `/api/mall/orders` | `listOrders` |
| GET | `/api/mall/inventory` | `inventory` |
| GET | `/api/mall/admin/orders` | `adminOrders` |
| POST | `/api/mall/products/:id/redeem` | `redeem` |

**`/api/messages`**

| 方法 | 路径 | Handler |
|---|---|---|
| GET | `/api/messages` | `conversations` |
| GET | `/api/messages/unread` | `unread` |
| POST | `/api/messages/:peerId/settings` | `updateSettings` |
| GET | `/api/messages/:peerId` | `thread` |
| DELETE | `/api/messages/:peerId` | `remove` |
| POST | `/api/messages/:peerId` | `send` |

**`/api/nav`**

| 方法 | 路径 | Handler |
|---|---|---|
| GET | `/api/nav` | `directory` |
| GET | `/api/nav/popular` | `popular` |
| GET | `/api/nav/mine` | `myDirectory` |
| POST | `/api/nav/mine` | `addMyLink` |
| DELETE | `/api/nav/mine/:id` | `removeMyLink` |
| POST | `/api/nav/categories` | `createCategory` |
| POST | `/api/nav/links` | `createLink` |
| PUT | `/api/nav/categories/:id` | `updateCategory` |
| PUT | `/api/nav/links/:id` | `updateLink` |
| DELETE | `/api/nav/categories/:id` | `removeCategory` |
| DELETE | `/api/nav/links/:id` | `removeLink` |
| POST | `/api/nav/:id/click` | `click` |

**`/api/notices`**

| 方法 | 路径 | Handler |
|---|---|---|
| GET | `/api/notices` | `list` |
| GET | `/api/notices/all` | `all` |
| POST | `/api/notices` | `create` |
| PUT | `/api/notices/:id` | `update` |
| DELETE | `/api/notices/:id` | `remove` |

**`/api/notifications`**

| 方法 | 路径 | Handler |
|---|---|---|
| GET | `/api/notifications` | `list` |
| GET | `/api/notifications/unread` | `unread` |
| POST | `/api/notifications/read` | `readAll` |
| POST | `/api/notifications/:id/read` | `readOne` |

**`/api/pay`**

| 方法 | 路径 | Handler |
|---|---|---|
| POST | `/api/pay/epay/create` | `createEpay` |
| GET | `/api/pay/epay/notify` | `epayNotifyGet` |
| POST | `/api/pay/epay/notify` | `epayNotifyPost` |
| GET | `/api/pay/epay/return` | `epayReturn` |
| POST | `/api/pay/alipay/create` | `createAlipay` |
| POST | `/api/pay/alipay/notify` | `alipayNotify` |
| GET | `/api/pay/alipay/return` | `alipayReturn` |
| POST | `/api/pay/wechat/create` | `createWechat` |
| POST | `/api/pay/wechat/notify` | `wechatNotify` |
| GET | `/api/pay/orders` | `myOrders` |
| GET | `/api/pay/admin/orders` | `adminOrders` |

**`/api/posts`**

| 方法 | 路径 | Handler |
|---|---|---|
| GET | `/api/posts` | `feed` |
| POST | `/api/posts` | `create` |
| GET | `/api/posts/user/:username` | `byUser` |
| GET | `/api/posts/liked/:username` | `liked` |
| GET | `/api/posts/:id/related` | `related` |
| GET | `/api/posts/:id/siblings` | `siblings` |
| POST | `/api/posts/:id/vote` | `vote` |
| POST | `/api/posts/:id/grab` | `grab` |
| POST | `/api/posts/:id/share` | `share` |
| POST | `/api/posts/:id/like` | `like` |
| POST | `/api/posts/:id/react` | `react` |
| GET | `/api/posts/:id/reactions` | `reactions` |
| POST | `/api/posts/:id/unlock` | `unlock` |
| POST | `/api/posts/:id/reward` | `reward` |
| POST | `/api/posts/:id/pin` | `pin` |
| POST | `/api/posts/:id/global-pin` | `globalPin` |
| POST | `/api/posts/:id/bookmark` | `bookmark` |
| PUT | `/api/posts/:id` | `update` |
| DELETE | `/api/posts/:id` | `remove` |
| GET | `/api/posts/:id` | `findOne` |

**`/api/qa`**

| 方法 | 路径 | Handler |
|---|---|---|
| GET | `/api/qa` | `list` |
| GET | `/api/qa/spotlight` | `spotlight` |
| GET | `/api/qa/admin/stats` | `adminStats` |
| POST | `/api/qa/answers/:id/vote` | `voteAnswer` |
| POST | `/api/qa` | `ask` |
| POST | `/api/qa/:id/answers` | `answer` |
| POST | `/api/qa/:id/accept/:answerId` | `accept` |
| GET | `/api/qa/:id` | `detail` |
| DELETE | `/api/qa/:id` | `adminRemove` |

**`/api/reports`**

| 方法 | 路径 | Handler |
|---|---|---|
| POST | `/api/reports` | `create` |

**`/api/search`**

| 方法 | 路径 | Handler |
|---|---|---|
| GET | `/api/search/trending` | `trending` |
| GET | `/api/search` | `query` |

**`/api/site`**

| 方法 | 路径 | Handler |
|---|---|---|
| GET | `/api/site` | `get` |

**`/api/topics`**

| 方法 | 路径 | Handler |
|---|---|---|
| GET | `/api/topics` | `list` |
| GET | `/api/topics/following` | `following` |
| GET | `/api/topics/admin/stats` | `adminStats` |
| GET | `/api/topics/:name` | `detail` |
| POST | `/api/topics/:name/follow` | `follow` |

**`/api/upload`**

| 方法 | 路径 | Handler |
|---|---|---|
| POST | `/api/upload` | `FilesInterceptor` |

**`/api/users`**

| 方法 | 路径 | Handler |
|---|---|---|
| GET | `/api/users/mention` | `mention` |
| GET | `/api/users/me/bookmarks` | `myBookmarks` |
| GET | `/api/users/me/blocks` | `myBlocks` |
| GET | `/api/users/me/stats` | `meStats` |
| GET | `/api/users/me/invites` | `meInvites` |
| PUT | `/api/users/me/profile` | `updateProfile` |
| POST | `/api/users/me/recharge` | `recharge` |
| GET | `/api/users/ranking/checkin` | `rankingCheckin` |
| GET | `/api/users/ranking/:type` | `ranking` |
| GET | `/api/users/suggestions` | `suggestions` |
| POST | `/api/users/:id/block` | `block` |
| GET | `/api/users/:id/blocked` | `blocked` |
| POST | `/api/users/:id/follow` | `follow` |
| GET | `/api/users/:username/visitors` | `visitors` |
| GET | `/api/users/:username/:rel` | `relations` |
| GET | `/api/users/:username` | `profile` |

