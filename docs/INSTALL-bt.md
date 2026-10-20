# 宝塔面板部署教程（BT Panel / aaPanel）

> 🧭 **不确定用哪种装法？** 先看 [安装方式速览](../README.md#-快速开始) 对号入座。
> 分路：[图形面板 · 1Panel](INSTALL-1panel.md) / [宝塔](INSTALL-bt.md)（**非技术用户推荐**） · [命令行 · Docker / 裸机](DEPLOY.md) · [完整安装手册](INSTALL.md) · [让 AI 助手代装](DEPLOY-AI.md) · [配置与维护参考](CONFIGURATION.md)


BananaSNS 后端是 `server-nest`（NestJS + TypeORM + **MariaDB** + **Redis**），`app` 进程同时伺服前端页面（`client/dist`）、`/api` 接口和 `/uploads` 上传——**全部在同一个端口上**，无需单独建静态站或手写 Nginx `try_files`。

宝塔上两种装法，**推荐 A（Docker 编排，最省事，数据库/缓存一并起好）**；不想用 Docker 走 B。

> **🌏 大陆 / 国外** — **建议优先选非大陆机房（香港 / 新加坡 / 日本 / 美国等）**：镜像构建更顺、内置 AI 助手（Anthropic API）可用、且免 ICP 备案。必须用大陆时按下面两步绕过网络问题。
> - **大陆服务器**：① 宝塔「Docker → 配置」加一个国内镜像加速；② `.env` 里取消注释 `NPM_REGISTRY=https://registry.npmmirror.com`。否则拉镜像/装依赖慢甚至失败。（注：AI 助手在大陆直连不可用，需留空降级或自备代理。）
> - **国外服务器**：保持默认，无需改动。

---

## 🐣 零基础最省心版（4 步 · 全程面板点点点）

> 完全没碰过命令行也能装完。前提：一台服务器 + 已装宝塔面板。

1. **装 Docker**：宝塔「软件商店」搜 `Docker` → 安装（会一并装好 Docker Compose）。
2. **把代码放上去**：宝塔「文件」进到 `/www/wwwroot`，用「远程下载」拉发布包解压、或直接在「终端」里 `git clone https://github.com/xhwwstudio/bananasecret.git bananasns`，得到一个 `bananasns` 文件夹。
3. **填 2 个密码**：宝塔「文件」里打开 `bananasns/.env`，把 `JWT_SECRET` 和 `DB_PASSWORD` 各改成一长串随机字母数字（随便敲长一点、别人猜不到即可）。〔**大陆服务器**：再把 `NPM_REGISTRY=https://registry.npmmirror.com` 那行前面的 `#` 删掉。〕
4. **一键起**：宝塔「Docker → 编排 → 创建编排」，目录选 `/www/wwwroot/bananasns`（里面有 `docker-compose.yml`），点构建并启动。等几分钟，浏览器访问 `你的服务器IP:4000` 就能看到站点。

> 想**绑域名 + HTTPS**、**设管理员账号**、或哪一步**卡住了** → 看下面「方式 A」的详细步骤与说明。
> **实在搞不定？** 把本仓库和 [AI 部署指南](DEPLOY-AI.md) 一起丢给 Claude Code / Codex，让 AI 助手照着帮你装（它会自己填配置、跑健康检查）。

---

## 方式 A：Docker 编排（推荐）

一份 `docker-compose.yml` 起三个容器：`app`（后端+前端）+ `mariadb` + `redis`，已编排好依赖与健康检查。**你要配的只有：JWT 密钥 + 数据库密码 + 域名。**

### 1) 准备
- 宝塔软件商店装 **Docker**（含 Docker Compose）。**大陆**在「Docker → 配置」配镜像加速。
- 备一个解析到服务器的域名（可选；没有先用 `IP:端口`）。

### 2) 拉代码 + 配置
宝塔「终端」：
```bash
cd /www/wwwroot
git clone https://github.com/xhwwstudio/bananasecret.git bananasns && cd bananasns
cp .env.example .env
# 编辑 .env：JWT_SECRET 和 DB_PASSWORD 都改成强随机串
#   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
# 【大陆】取消注释：NPM_REGISTRY=https://registry.npmmirror.com
```

### 3) 起容器
宝塔「Docker → 编排 → 创建编排」，来源指到 `/www/wwwroot/bananasns`（含 `docker-compose.yml`），构建并启动；或终端：
```bash
cd /www/wwwroot/bananasns
docker compose up -d --build      # 首次构建 + 拉起 mariadb/redis，几分钟
curl http://127.0.0.1:4000/api/health   # 应返回 {"ok":true,"app":"BananaSNS"}
```
`app` 首启会自动建表（`DB_SYNCHRONIZE=true`）。数据库初始为空。**设首个管理员**两种方式任选：① 部署前在 `.env` 加 `SEED_ADMIN_USER` 与 `SEED_ADMIN_PASSWORD`，首启自动建管理员（库内已有管理员则忽略）；② 或先注册一个账号，再在 mariadb 容器执行 `UPDATE users SET role='admin' WHERE username='你的账号';`。

### 4) 绑域名 + HTTPS
宝塔「网站 → 反向代理」（或建站后加反代）：代理到 `http://127.0.0.1:4000`，再一键申请 Let's Encrypt 证书、开强制 HTTPS。上传大文件被拦就把反代 `client_max_body_size` 调到 `30m`。

### 5) 更新与数据
```bash
cd /www/wwwroot/bananasns && git pull && docker compose up -d --build
```
数据库/缓存/上传都在 Docker **命名卷**（`bananasns-db` / `bananasns-redis` / `bananasns-uploads`），`git pull` 与重建容器都不丢；生产建议定期 `docker exec bananasns-mariadb mariadb-dump` 备份库。

---

## 方式 B：宝塔 Node 项目（不用 Docker）

适合不想装 Docker、想用宝塔自带 MySQL/Redis 的场景。

### 1) 准备
- 软件商店装 **Node.js 版本管理器**（装 Node 20 LTS 设默认）、**MySQL**（5.7/8 均可）、**Redis**。
- MySQL 里建库 `bananasns` 与用户（记下用户名/密码）。

### 2) 拉代码 + 构建
```bash
cd /www/wwwroot/bananasns
# 前端
cd client && npm install && npm run build && cd ..
# 后端（server-nest）
cd server-nest && npm install && npm run build && cd ..
# 大陆加速：上面 npm install 前 `npm config set registry https://registry.npmmirror.com`
```
得到 `client/dist` 与 `server-nest/dist`。

### 3) 建 Node 项目
宝塔「网站 → Node 项目 → 添加」：

| 项 | 填写 |
| --- | --- |
| 项目目录 | `/www/wwwroot/bananasns/server-nest` |
| 启动方式 | `node dist/main.js` |
| Node 版本 | 20 |
| 端口 | `4000` |
| 守护 / 开机自启 | 打开 |

**环境变量**（Node 项目「环境变量」里逐条加）：

| 变量 | 说明 |
| --- | --- |
| `JWT_SECRET` | **必改**，登录令牌密钥（强随机串） |
| `PORT` | `4000` |
| `DB_CLIENT` | `mysql` |
| `DB_HOST` / `DB_PORT` | `127.0.0.1` / `3306` |
| `DB_USER` / `DB_PASSWORD` / `DB_NAME` | 宝塔里建的 MySQL 用户/密码/库（库名 `bananasns`） |
| `DB_SYNCHRONIZE` | `true`（首启建表；稳定后可改 `false`） |
| `REDIS_URL` | `redis://127.0.0.1:6379`（宝塔 Redis 有密码则 `redis://:密码@127.0.0.1:6379`） |
| `CLIENT_DIST` | `/www/wwwroot/bananasns/client/dist` |
| `UPLOADS_DIR` | `/www/wwwroot/bananasns/server-nest/uploads`（上传存这里；配了 `S3_*` 则走对象存储） |
| `NODE_ENV` | `production` |

> 生成 JWT 密钥：`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`

启动后 `curl http://127.0.0.1:4000/api/health` 应返回 `{"ok":true,"app":"BananaSNS"}`。绑域名同方式 A 第 4 步。

### 更新
```bash
cd /www/wwwroot/bananasns && git pull
cd client && npm run build && cd ../server-nest && npm install && npm run build
# 然后宝塔 Node 项目里点重启
```
数据在 MySQL（用宝塔「数据库」备份）、上传在 `server-nest/uploads`，更新切勿覆盖。

---

## 常见问题

| 现象 | 排查 |
| --- | --- |
| 构建慢 / 拉镜像失败（大陆） | 配了 Docker 镜像加速 / `NPM_REGISTRY` 吗？ |
| 打开 404 / 白屏 | `client/dist` 构建了吗？`CLIENT_DIST`（方式 B）指对了吗？容器/项目在运行吗？ |
| 接口 502 | `curl 127.0.0.1:4000/api/health` 通吗？反代是否指 `http://127.0.0.1:4000`？ |
| 启动报连不上数据库 | `DB_HOST/PORT/USER/PASSWORD/NAME` 是否正确？MySQL/Redis 是否在运行？方式 A 里 `DB_HOST` 应为 `mariadb`（容器名）。 |
| 上传失败 | 反代 `client_max_body_size` ≥ `30m`。 |
