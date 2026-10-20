# BananaSNS — NestJS Backend (`server-nest/`)

A NestJS 10 + TypeScript backend that migrates the original Express +
better-sqlite3 API (`../server/`) onto production infrastructure:

- **TypeORM** with an env-driven driver switch — **MySQL** (default) or **PostgreSQL**
- **Redis** cache via `@nestjs/cache-manager` + `ioredis`
- **S3-compatible object storage** (`@aws-sdk/client-s3`), targeting **rustfs** (also MinIO / AWS S3)
- **JWT** auth (`@nestjs/jwt` + `bcryptjs`)
- **class-validator** DTOs

The **Auth**, **Users**, and **Posts** modules are fully ported as the reference
pattern. Endpoint paths (`/api/auth`, `/api/users`, `/api/posts`, `/api/upload`,
`/api/health`) and JSON response shapes match the Express version **exactly**, so
the existing client works unchanged.

---

## Architecture

```
src/
├── main.ts                      # bootstrap: CORS, 10mb JSON, ValidationPipe, error filter
├── app.module.ts                # root module — wires infra + feature modules
├── app.controller.ts            # GET /api/health
├── config/
│   └── configuration.ts         # all env vars in one typed config object
├── common/                      # cross-cutting, @Global
│   ├── common.module.ts         # JwtModule + HelpersService + guards (global)
│   ├── helpers.service.ts       # publicUser / notify / award / level curve / parsers
│   ├── sensitive.ts             # ported sensitive-word filter (checkSensitive)
│   ├── decorators/current-user.decorator.ts   # @CurrentUser() -> req.user
│   ├── guards/jwt-auth.guard.ts               # JwtAuthGuard (requireAuth) + AdminGuard
│   ├── guards/optional-auth.guard.ts          # OptionalAuthGuard (optionalAuth)
│   └── filters/http-exception.filter.ts       # normalizes errors to { error: "..." }
├── database/
│   ├── database.module.ts       # TypeOrmModule.forRootAsync — mysql|postgres switch
│   └── entities/                # one file per table (columns mirror ../server schema)
│       ├── user, post, comment, follow, like      (core, per the brief)
│       ├── topic, bookmark, block, notification    (referenced by ported modules)
│       ├── purchase, reward, product, order
│       ├── poll (polls + poll_options + poll_votes)
│       └── circle (circles + circle_members)
└── modules/
    ├── cache/redis-cache.module.ts     # Redis cache (REDIS_URL)
    ├── storage/                        # S3-compatible object storage
    │   ├── storage.module.ts
    │   ├── storage.service.ts          # upload / delete / signed URLs
    │   └── uploads.controller.ts       # POST /api/upload (multipart, field "files")
    ├── auth/                           # /api/auth
    ├── users/                          # /api/users
    ├── posts/                          # /api/posts (incl. polls vote/create)
    ├── comments/                       # /api/comments
    ├── topics/                         # /api/topics
    ├── notifications/                  # /api/notifications
    ├── messages/                       # /api/messages
    ├── search/                         # /api/search
    ├── circles/                        # /api/circles
    ├── qa/                             # /api/qa
    ├── flash/                          # /api/flash
    ├── nav/                            # /api/nav
    ├── achievements/                   # /api/achievements
    ├── mall/                           # /api/mall
    ├── forum/                          # /api/forum
    ├── reports/                        # /api/reports
    ├── feedback/                       # /api/feedback
    ├── admin/                          # /api/admin (AdminGuard)
    └── ai/                             # /api/ai
```

### Design notes

- **Response parity.** `HelpersService.publicUser()` and `PostsService.serializePost()`
  reproduce the Express JSON shapes field-for-field (booleans via `!!`, camelCase
  keys, nested `levelProgress`, `poll`, `shared`, anonymous-author masking, etc.).
- **Error parity.** A global exception filter rewrites every error to
  `{ error: "<message>" }` with the original status code (400/401/402/403/404/409),
  matching what the client reads from `err.response.data.error`.
- **Timestamps.** Columns are stored as `'YYYY-MM-DD HH:MM:SS'` strings
  (`HelpersService.nowSql()`) to stay shape-compatible with the SQLite-era data.
- **`media`** stays a JSON string in the `posts` table (parsed on read), exactly
  as before.
- **Route ordering.** Controllers declare static / multi-segment routes before
  the catch-all `:id` / `:username` routes so matching matches Express precedence.
- **Portability.** Entity column types are chosen to work on both MySQL and
  Postgres; booleans use `smallint` 0/1. A couple of hot-path updates use raw SQL
  with a Postgres fallback (`ON CONFLICT` / `$n` placeholders).

---

## Environment variables

Copy `.env.example` to `.env` and fill in. Summary:

| Var | Purpose | Default |
| --- | --- | --- |
| `PORT` | HTTP port | `4000` |
| `JWT_SECRET` | token signing secret | dev placeholder |
| `JWT_EXPIRES_IN` | token lifetime | `30d` |
| `DB_CLIENT` | `mysql` or `postgres` | `mysql` |
| `DB_HOST` / `DB_PORT` | database host/port | `127.0.0.1` / 3306 (5432 for pg) |
| `DB_USER` / `DB_PASSWORD` / `DB_NAME` | credentials + db | — |
| `DB_SYNCHRONIZE` | auto-create tables (dev only) | `false` |
| `DB_LOGGING` | SQL logging | `false` |
| `REDIS_URL` | Redis connection | `redis://127.0.0.1:6379` |
| `REDIS_TTL` | default cache TTL (ms) | `30000` |
| `S3_ENDPOINT` | rustfs / MinIO / S3 endpoint | `http://127.0.0.1:9000` |
| `S3_BUCKET` | bucket name | `bananasns` |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | credentials | — |
| `S3_REGION` | region | `us-east-1` |
| `S3_FORCE_PATH_STYLE` | path-style addressing (rustfs/MinIO) | `true` |
| `S3_PUBLIC_URL` | public base URL for media (optional CDN) | derived |

> Secrets are placeholders only — never commit a real `.env`.

---

## Running

### Prerequisites

- Node 18+ (developed on Node 22)
- A MySQL **or** PostgreSQL server, a Redis server, and an S3-compatible store
  (rustfs / MinIO / S3). Create the database and bucket up front.
- For the **first run**, set `DB_SYNCHRONIZE=true` so TypeORM creates the tables
  from the entities, then turn it back off and rely on migrations.

### Install & build

```bash
cd server-nest
npm install
npm run build          # compiles to dist/  (verified: builds clean)
```

### Develop

```bash
cp .env.example .env   # then edit credentials
npm run start:dev      # watch mode
```

### Production

```bash
npm run build
npm run start:prod     # node dist/main.js
```

Health check: `GET http://localhost:4000/api/health` → `{ "ok": true, "app": "BananaSNS" }`

---

## Ported endpoints (reference pattern)

**`/api/auth`** — `POST register`, `POST login`, `GET me`, `POST password`,
`POST checkin`, `POST change-username`

**`/api/users`** — `GET mention`, `GET me/bookmarks`, `GET me/blocks`,
`PUT me/profile`, `POST me/recharge`, `GET ranking/checkin`, `GET ranking/:type`,
`GET suggestions`, `POST :id/block`, `GET :id/blocked`, `POST :id/follow`,
`GET :username/:rel`, `GET :username`

**`/api/posts`** — `GET /` (feed), `POST /` (create), `GET user/:username`,
`GET liked/:username`, `GET :id/related`, `GET :id/siblings`, `POST :id/vote`,
`POST :id/share`, `POST :id/like`, `POST :id/unlock`, `POST :id/reward`,
`POST :id/pin`, `POST :id/global-pin`, `POST :id/bookmark`, `PUT :id`,
`DELETE :id`, `GET :id`

**`/api/upload`** — `POST /` (multipart `files`, up to 9 → S3)

**`/api/comments`** — `GET /` (nested tree, `?postId`/`?threadId`/`?sort`),
`POST /`, `POST :id/like`, `DELETE :id`

**`/api/topics`** — `GET /` (hot + `?q`), `GET following`, `GET :name`,
`POST :name/follow`

**`/api/notifications`** — `GET /`, `GET unread`, `POST read`, `POST :id/read`

**`/api/messages`** — `GET /` (conversations), `GET unread`,
`POST :peerId/settings`, `GET :peerId` (thread), `DELETE :peerId`,
`POST :peerId` (send)

**`/api/search`** — `GET trending`, `GET /` (users/posts/threads/topics)

**`/api/circles`** — `GET /` (`?category`/`?sort`/`?mine`), `GET suggestions`,
`POST /`, `GET :slug`, `GET :slug/posts`, `POST :id/join`, `POST :id/leave`

**`/api/qa`** — `GET /`, `GET spotlight`, `POST answers/:id/vote`, `POST /`,
`POST :id/answers`, `POST :id/accept/:answerId`, `GET :id`

**`/api/flash`** — `GET /` (`?limit`/`?category`), `POST /` (admin)

**`/api/nav`** — `GET /`, `GET popular`, `POST categories` (admin),
`POST links` (admin), `POST :id/click`

**`/api/achievements`** — `GET /` (tasks + badges + stats),
`GET user/:id/badges`, `POST claim/:key`

**`/api/mall`** — `GET products`, `GET orders`, `GET inventory`,
`POST products/:id/redeem`

**`/api/forum`** — `GET boards`, `GET my-boards`, `POST boards/:id/follow`,
`GET boards/:slug`, `GET threads`, `GET threads/user/:username`,
`POST threads`, `POST threads/:id/like`, `PUT threads/:id`,
`POST threads/:id/moderate`, `GET threads/:id`

**`/api/reports`** — `POST /`

**`/api/feedback`** — `POST /`, `GET /` (`?status`), `POST :id/reply` (admin)

**`/api/admin`** (AdminGuard) — `GET overview`, `GET users`, `PUT users/:id`,
`POST boards`, `PUT boards/:id`, `DELETE boards/:id`, `POST boards/:id/moderators`,
`POST topics`, `DELETE topics/:id`, `GET reports`, `POST reports/:id/resolve`,
`POST products`, `DELETE products/:id`, `DELETE content/:type/:id`

**`/api/ai`** — `GET status`, `GET conversations`, `POST conversations`,
`GET conversations/:id`, `DELETE conversations/:id`,
`POST conversations/:id/messages` (Anthropic Messages API + demo fallback)

---

## Remaining modules to port

All feature modules from the original Express API are now ported. Each follows
the same pattern as auth/users/posts (entity → DTOs → service → controller →
module, then registered in `app.module.ts`). The corresponding Express routes
live in `../server/src/routes/`.

- [x] **comments** — `comments.js` (nested comments on posts & threads, likes)
- [x] **forum** — `forum.js` (boards, threads, replies, moderators, board follows)
- [x] **circles** — `circles.js` (entities already defined: `circles`, `circle_members`)
- [x] **qa** — `qa.js` (questions / answers / answer votes — `questions`/`answers`/`answer_votes`)
- [x] **flash** — `flash.js` (资讯快报 / news feed — `flash` entity)
- [x] **nav** — `nav.js` (网址导航 — `nav_categories`, `nav_links` entities)
- [x] **achievements** — `achievements.js` (`user_badges`, `task_claims` entities)
- [x] **mall** — `mall.js` (products / orders — entities already defined)
- [x] **messages** — `messages.js` (私信 — `messages`, `conversation_settings`)
- [x] **notifications** — `notifications.js` (`notifications` entity already defined)
- [x] **topics** — `topics.js` (`topics` entity already defined; `topic_follows`)
- [x] **search** — `search.js` (cross-entity search)
- [x] **reports** — `reports.js` (举报 — `reports` entity)
- [x] **feedback** — `feedback.js` (问题反馈 — `feedback` entity)
- [x] **admin** — `admin.js` (uses the `AdminGuard` already provided)
- [x] **ai** — `ai.js` (AI assistant — `ai_conversations`, `ai_messages`)
- [x] **polls** — `POST /api/posts/:id/vote` + `poll` body on create (in posts)

When porting:

1. Add any missing entities under `src/database/entities/` and register them in
   `entities/index.ts`.
2. Reuse `HelpersService` (publicUser / notify / award / parsers), the auth
   guards, `@CurrentUser()`, and `checkSensitive` rather than re-implementing.
3. Keep response shapes identical to the Express route so the client is unaffected.
4. Swap local-disk media for `StorageService` (S3) where the old code wrote to
   `/uploads`.
