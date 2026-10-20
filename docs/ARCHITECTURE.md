# BananaSNS — Architecture

BananaSNS 是单仓库全栈应用：React SPA + 一个 **NestJS** 进程（`server-nest/`）同时伺服构建后的 SPA、`/api` 与 `/uploads`。后端基于 NestJS 10 + TypeScript + TypeORM，数据落 **MySQL/MariaDB**、缓存用 **Redis**、上传媒体可走 **S3 兼容对象存储**（未配置则回退本地磁盘）。配套 `docker-compose.yml` 一键起 `app + mariadb + redis`（线上 Demo 即此架构），部署见 [INSTALL-1panel](INSTALL-1panel.md) / [INSTALL-bt](INSTALL-bt.md)。

---

## 1. High-level overview

```
                            ┌──────────────────────────────────────────────┐
                            │                  Browser (SPA)                │
                            │   React 19 + React Router + HeroUI + Tailwind │
                            │                                                │
                            │   ThemeContext ─ 6 skins × light/dark          │
                            │   AuthContext  ─ JWT in localStorage           │
                            │   axios client ─ baseURL "/api"                │
                            └───────────────┬────────────────────────────────┘
                                            │  HTTPS  (JSON over /api/*, JWT Bearer)
                                            ▼
        ┌───────────────────────────────────────────────────────────────────────┐
        │                   NestJS server (server-nest, Node)                    │
        │                                                                        │
        │   pipeline: ValidationPipe(DTO) → Guards(Jwt/Optional/Admin) →         │
        │             Controllers → Services → TypeORM repos                     │
        │                                                                        │
        │   modules:  auth · users · posts · comments · forum · circles · qa     │
        │   · flash · nav · achievements · mall · messages · notifications       │
        │   · topics · search · reports · feedback · admin · articles · events   │
        │   · lottery · checkin · site · notices · history · storage(/api/upload)│
        │                                                                        │
        │   common(@Global): HelpersService(award/notify/publicUser/logAdmin) ·  │
        │     SensitiveService · guards · HttpExceptionFilter(+SPA 404 兜底)     │
        │                                                                        │
        │   static (main.ts): client/dist(SPA) + UPLOADS_DIR(/uploads)          │
        └───────────────┬──────────────────────────────────┬────────────────────┘
                        │  TypeORM (mysql2)                 │  ioredis
                        ▼                                   ▼
   ┌─────────────────────────────────────────┐   ┌──────────────────────────┐
   │        MySQL / MariaDB (TypeORM)         │   │      Redis (cache)        │
   │  users · posts · comments · likes ·      │   └──────────────────────────┘
   │  follows · topics · boards · threads ·   │
   │  circles · polls · questions · answers · │   上传媒体 → S3 兼容对象存储
   │  flash · nav · badges · products ·       │   (storage 模块；未配置则
   │  orders · messages · notifications ·     │    写本地 UPLOADS_DIR，由
   │  reports · feedback · articles · events ·│    /uploads 静态伺服)
   │  lottery · red_packets · board_purchases │
   │  · thread_subs · admin_audit_log …       │   DB_SYNCHRONIZE 首启建表
   └─────────────────────────────────────────┘
```

---

## 2. Tech stack

| Layer | Choice | Notes |
| --- | --- | --- |
| UI framework | **React 19** + **React Router v6** | SPA, client-side routing |
| Components | **HeroUI** (`@heroui/react`) | themed primitives (Card, Tabs, Input, Modal, …) |
| Styling | **Tailwind CSS** (preflight off) + a hand-rolled CSS token system | `styles/tokens.css → base → layout → components → pages` |
| Motion | **framer-motion** | micro-interactions (reduced-motion aware) |
| Build | **Vite** | dev server proxies `/api` + `/uploads` to the API |
| Server | **NestJS 10** (TypeScript) | controllers/services/modules, one module per domain |
| ORM / DB | **TypeORM 0.3** → **MySQL / MariaDB** (PostgreSQL also supported) | `mysql2` driver; entities under `database/entities` |
| Cache | **Redis** (`ioredis` + `cache-manager`) | |
| Uploads | **S3-compatible object storage** (`@aws-sdk/client-s3`); local-disk fallback | `/api/upload` → S3 or `UPLOADS_DIR`, served at `/uploads` |
| Auth | **JWT** (`@nestjs/jwt`) + **bcryptjs** | stateless bearer tokens |
| Validation | **class-validator** / **class-transformer** | DTOs via global `ValidationPipe` |

---

## 3. Repository layout

```
bananasns/
├── client/                     # React SPA (Vite)
│   └── src/
│       ├── pages/              # one component per route (Home, Circles, QA, Mall, …)
│       ├── components/         # shared UI (PostCard, Composer, Shell, Avatar, …)
│       ├── context/           # AuthContext, ThemeContext, ToastContext, ComposeContext
│       ├── api/client.ts       # axios instance (baseURL /api, attaches JWT)
│       └── styles/            # tokens.css, base.css, layout.css, components.css, pages.css
│
├── server-nest/                # NestJS API (single process serves SPA + /api + /uploads)
│   ├── src/
│   │   ├── main.ts            # bootstrap + static serving(client/dist, /uploads) + pipes/filter
│   │   ├── app.module.ts      # wires every feature module
│   │   ├── common/            # HelpersService, SensitiveService, guards, decorators, filter
│   │   ├── database/entities/ # TypeORM entities (User, Post, Thread, RedPacket, …)
│   │   └── modules/           # one module per domain (auth/users/posts/forum/…/storage)
│   └── scripts/               # 部署脚本 (redeploy.sh)
│
└── docs/                       # README, INSTALL(+1panel/bt), API, CONFIGURATION, ARCHITECTURE
```

---

## 4. Request lifecycle

1. The SPA calls `api.get('/posts')`; the axios client prefixes `/api` and attaches `Authorization: Bearer <jwt>` if a token is in `localStorage`.
2. NestJS runs the global `ValidationPipe` (DTO whitelist/transform), then route guards: `OptionalAuthGuard` (decode JWT if present, never rejects) for public reads, `JwtAuthGuard` (401 without a valid token) for authed endpoints, `AdminGuard` (role === 'admin') for `/api/admin/*`.
3. The matching controller delegates to a service, which uses TypeORM repositories (`mysql2`) and serializes rows with shared helpers like `publicUser()` / `serializePost()`.
4. Side effects flow through the `@Global` `HelpersService`: `award()` (exp/points), `notify()` (skips self), `recordView()` (footprints), `logAdmin()` (audit); content-create paths run `checkSensitive()` (moderation, hot-reloaded from `site_config` by `SensitiveService`).
5. Errors are normalized by `HttpExceptionFilter` to `{ error }`; on a 404 for a non-`/api` GET it serves the SPA `index.html` (deep-link fallback).

---

## 5. Data & theming notes

- **Schema** — TypeORM entities are the source of truth; `DB_SYNCHRONIZE=true` auto-creates/updates tables on boot (first install). For controlled production changes, switch it off and use migrations.
- **Caching** — Redis backs cache-manager for hot reads; `SensitiveService` periodically refreshes the moderation config from `site_config`.
- **Uploads** — the storage module writes to S3-compatible object storage when `S3_*` is configured, otherwise to the local `UPLOADS_DIR` (served at `/uploads`). Either way the client sees a `{ url, type, name }` shape.
- **Theming** — `ThemeContext` sets `data-theme` (light/dark), `data-skin`, and a HeroUI theme class on `<html>`. Six color skins × light/dark, bridged into the custom CSS via design tokens (`--brand`, `--surface`, `--ink`, …).
- **Single-process** — `npm run build` emits `client/dist` and compiles `server-nest`; the NestJS process serves that bundle plus `/uploads` alongside `/api`, so the whole app is one origin and one process (`docker-compose.yml` adds MariaDB + Redis).

See [INSTALL.md](INSTALL.md) / [INSTALL-1panel.md](INSTALL-1panel.md) / [INSTALL-bt.md](INSTALL-bt.md) to run it, [API.md](API.md) for the endpoint reference, and [CONFIGURATION.md](CONFIGURATION.md) for env/ops.
