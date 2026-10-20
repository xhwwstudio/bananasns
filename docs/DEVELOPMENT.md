# 开发手册

本手册面向想在本地参与 BananaSNS 开发的同学，介绍本地开发流程、项目结构、前后端启动、构建打包与常用脚本。

> 想直接部署上线，请看 [INSTALL.md](INSTALL.md) 与 [DEPLOY.md](DEPLOY.md)；宝塔面板教程见 [INSTALL-bt.md](INSTALL-bt.md)。

---

## 一、环境要求

- **Node.js 20 LTS** 与 **npm**
  ```bash
  node -v   # 应输出 v20.x（或更高 LTS）
  ```
- **Git**
- **MySQL 8+ / MariaDB 10.6+** 与 **Redis 7** —— 后端依赖二者，本地开发也要能连上。
  - 最省事是在本机各起一个实例（或用 Docker 起 `mysql` + `redis`）；
  - 也可以让本地后端连到一个**专用的开发数据库 / Redis**，但**切勿连生产库**。

---

## 二、获取代码与安装依赖

```bash
git clone https://github.com/xhwwstudio/bananasns.git bananasns
cd bananasns
```

仓库是多包结构（根 + client + server-nest 三处依赖），在仓库根目录一条命令装齐：

```bash
npm run install:all               # 依次安装 根(concurrently) + server-nest + client
```

也可以分别手动安装：

```bash
npm install                       # 根 devDependency: concurrently（npm run dev 需要）
cd client && npm install          # 前端
cd ../server-nest && npm install  # 后端（NestJS）
```

---

## 三、本地开发流程

### 0. 准备本地数据库与 Redis

后端需要能连上 MySQL/MariaDB 与 Redis。先建好开发库与账号（一次即可）：

```sql
CREATE DATABASE bananasns CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'bananasns'@'%' IDENTIFIED BY 'devpass';
GRANT ALL PRIVILEGES ON bananasns.* TO 'bananasns'@'%';
FLUSH PRIVILEGES;
```

后端的连接信息全部由环境变量驱动，本地开发常用一组：

```bash
export DB_CLIENT=mysql
export DB_HOST=127.0.0.1 DB_PORT=3306
export DB_USER=bananasns DB_PASSWORD=devpass DB_NAME=bananasns
export DB_SYNCHRONIZE=true       # 开发期让 TypeORM 自动按实体建表 / 同步结构
export REDIS_URL=redis://127.0.0.1:6379
export JWT_SECRET=dev-secret-change-me
```

> 不设这些变量时，后端会用内置默认值（`DB_USER`/`DB_NAME` 均为 `bananasns`、端口 3306、Redis 指向 `127.0.0.1:6379`），只要本地服务和这些默认一致也能直接跑起来。开发期把 `DB_SYNCHRONIZE` 设为 `true`，改了实体后表结构会自动跟着变。

日常开发推荐**前后端各开一个终端**，都带热重载。

### 方式 A：分别启动（推荐，便于看各自日志）

```bash
# 终端 1 —— 后端（NestJS，--watch 热重启），端口 4000
cd server-nest
npm run start:dev

# 终端 2 —— 前端（Vite dev server），端口 5173
cd client
npm run dev
```

打开 **http://localhost:5173** 即可。前端 dev server 已在 `client/vite.config.js` 中把 `/api`、`/uploads` 代理到 `http://localhost:4000`，所以前端直接用相对路径请求后端，无需关心跨域。

### 方式 B：一条命令同时拉起前后端

在仓库根目录（需先 `npm install` 根依赖）：

```bash
npm run dev
# server-nest 端口 4000，client 端口 5173，日志带颜色区分
```

### 第一个管理员账号

全新数据库为空、没有种子数据。在站点注册首个账号后，去数据库把它提升为管理员：

```sql
UPDATE users SET role='admin' WHERE username='<你的用户名>';
```

---

## 四、项目结构

```
bananasns/
├── client/                  # 前端 SPA
│   ├── public/showcase/     # 截图素材
│   ├── src/
│   │   ├── pages/           # 各页面（Home、Forum、Circles、QA、Mall、Admin 等，.tsx）
│   │   ├── components/      # 共享组件（Navbar、Shell、PostCard、Composer、Poll 等）
│   │   ├── context/         # React Context（Auth、Theme、Toast、Compose）
│   │   ├── api/             # Axios 实例（baseURL '/api'，Bearer token）
│   │   └── styles/          # Tailwind 入口与设计 token
│   ├── vite.config.js       # Vite 配置（端口 5173 + /api、/uploads 代理）
│   └── tsconfig.json
│
├── server-nest/             # 后端：NestJS 10 + TypeORM（MySQL/MariaDB + Redis，媒体本地或 S3）
│   └── src/
│       ├── main.ts          # 入口：启动应用，托管 client/dist（CLIENT_DIST）与 /uploads
│       ├── app.module.ts    # 根模块：装配 TypeORM、缓存、各功能模块
│       ├── config/          # 环境变量驱动的集中配置（configuration.ts）
│       ├── common/          # 守卫 / 过滤器 / 装饰器等共享件
│       └── modules/         # 各功能模块（auth、users、posts、forum、circles、mall…）
│
└── docs/                    # 文档目录
```

后端按「功能 = 一个 NestJS 模块」组织，每个模块在 `server-nest/src/modules/` 下自带 controller / service / entity，并在 `app.module.ts` 中装配；接口以独立前缀对外（如 `/api/posts`、`/api/forum`、`/api/circles` 等）。前端按「功能 = 一个页面」组织，页面在路由中注册。

---

## 五、构建与打包

### 前端构建

```bash
cd client
npm run build        # vite build → 产出 client/dist 静态文件
npm run preview      # 可选：本地预览构建产物
npm run typecheck    # 可选：tsc --noEmit 类型检查
```

### 后端构建

```bash
cd server-nest
npm run build        # nest build → 产出 dist/
node dist/main.js    # 或 npm run start:prod；若 CLIENT_DIST 指向 client/dist，将一并托管前端
```

也可在仓库根目录用一键脚本先后构建前端与后端：

```bash
npm run build        # = 构建 client 再构建 server-nest
npm start            # 以生产模式运行 server-nest（node dist/main.js）
```

---

## 六、常用脚本速查

### 根目录（`package.json`）

| 脚本 | 作用 |
| --- | --- |
| `npm run install:all` | 同时安装 server-nest 与 client 依赖 |
| `npm run dev` | 同时启动后端（start:dev）与前端 dev server |
| `npm run build` | 构建前端（client）再构建后端（server-nest） |
| `npm start` | 以生产模式运行 server-nest（`node dist/main.js`） |

### 前端（`client/package.json`）

| 脚本 | 作用 |
| --- | --- |
| `npm run dev` | 启动 Vite dev server（端口 5173） |
| `npm run build` | 生产构建（产出 `client/dist`） |
| `npm run preview` | 预览构建产物 |
| `npm run typecheck` | TypeScript 类型检查 |

### 后端（`server-nest/package.json`）

| 脚本 | 作用 |
| --- | --- |
| `npm run start` | 启动 NestJS |
| `npm run start:dev` | 启动并热重启（`nest start --watch`） |
| `npm run build` | 编译（`nest build` → `dist/`） |
| `npm run start:prod` | 运行编译产物（`node dist/main.js`） |
| `npm test` | 运行单元测试（vitest；用例在 `test/`，不参与 `nest build`） |
| `npm run lint` / `npm run format` | 代码检查 / 格式化 |

---

## 七、开发小贴士

- **接口约定**：前端 Axios 的 `baseURL` 为 `/api`，登录后携带 Bearer Token；后端健康检查 `GET /api/health` 返回 `{"ok":true,"app":"BananaSNS"}`。
- **新增接口**：在 `server-nest/src/modules/` 下新建（或扩展）一个模块——补上 entity / service / controller，并在 `app.module.ts` 中装配；开发期 `DB_SYNCHRONIZE=true` 会按实体自动建表 / 改表。新增 / 改动路由后，跑 `node scripts/gen-api-index.mjs`（加 `--check` 只看统计）从 controller 装饰器重新生成接口清单，粘回 `docs/API.md` 的「附录 · 完整接口清单」，让接口文档与代码零漂移。
- **新增页面**：在 `client/src/pages/` 下新建页面组件并在路由中注册，必要时在左侧导航补一个入口。
- **内容安全**：用户提交的文本应走敏感词过滤，写接口注意用相应的鉴权守卫（登录 / 管理员）。
- **代码风格**：后端 TypeScript，全量 ES Module，2 空格缩进，优先沿用所在文件的既有写法与命名；提交前可跑 `npm run lint` / `npm run format`。
- **测试**：后端用 vitest，用例放 `server-nest/test/*.test.ts`，`npm test` 运行（不参与 `nest build`）。改动纯逻辑（如敏感词过滤、积分/等级、支付签名）时建议补一两条用例，优先测可独立调用的纯函数。
- 更多接口细节见 [API.md](API.md)，架构说明见 [ARCHITECTURE.md](ARCHITECTURE.md)，配置项见 [CONFIGURATION.md](CONFIGURATION.md)。
