# AI 部署指南（给 Claude Code / Codex 等 AI 编码助手）

> 🧭 **不确定用哪种装法？** 先看 [安装方式速览](../README.md#-快速开始) 对号入座。
> 分路：[图形面板 · 1Panel](INSTALL-1panel.md) / [宝塔](INSTALL-bt.md)（**非技术用户推荐**） · [命令行 · Docker / 裸机](DEPLOY.md) · [完整安装手册](INSTALL.md) · [让 AI 助手代装](DEPLOY-AI.md) · [配置与维护参考](CONFIGURATION.md)


> 这份文档是写给**会执行命令的 AI 助手**看的：让你（AI）在一台全新 Linux 服务器上把 BananaSNS 自主部署起来。
> 全程以 **Docker 编排**为主路径（最确定、最可复现）。每一步都给了**校验闸门**与**期望输出**——校验不通过就停下排查，不要继续。
> **面向非技术站长**：也可以完全不碰命令行，改用 1Panel / 宝塔面板可视化部署——见下方「选择部署方式」。
>
> 技术栈：前端 React + Vite + HeroUI；后端 `server-nest`（NestJS 10 + TypeORM + MySQL/MariaDB + Redis）。`app` 单容器同端口伺服「前端 + `/api` + `/uploads`」。

---

## ⭐ 部署环境建议（先读 · 中国站长尤其重要）

**强烈建议把 BananaSNS 部署在「中国大陆以外」的服务器上**（香港 / 新加坡 / 日本 / 美国 / 欧洲 等）。原因：

- **构建更顺畅**：镜像构建要访问 Docker Hub、npm registry、GitHub。大陆直连这些常超时 / 被限速，导致 `docker compose up --build` 失败或极慢；非大陆基本一次过。
- **内置 AI 助手可用**：AI 助手走 Anthropic API（`ANTHROPIC_API_KEY`），**大陆无法直连**；只有非大陆环境（或服务器自备可访问的代理）才能启用，否则只能用降级的演示模式。
- **免 ICP 备案**：大陆服务器 + 域名对外提供服务需 ICP 备案，流程长；非大陆无此要求，拿到机器即可上线。
- **HTTPS 证书更稳**：Let's Encrypt 自动签发 / 续期在非大陆更可靠。

| 你的场景 | 推荐机房 |
| --- | --- |
| 面向全球用户、要用 AI 助手 | 香港 / 新加坡 / 日本 / 美国（**首选**） |
| 面向大陆用户、可不装 AI 助手 | 香港 / 日本（延迟低），或大陆 + 备案 |
| 内网 / 自用测试 | 任意，本机 Docker 即可 |

### 若必须用中国大陆服务器（逐项绕过网络问题）
1. **npm 走国内源**：`.env` 取消注释 `NPM_REGISTRY=https://registry.npmmirror.com`。
2. **Docker 镜像加速**：`/etc/docker/daemon.json` 配 `registry-mirrors`，否则拉 `mariadb`/`redis`/`node` 基础镜像很慢（配后 `systemctl restart docker`）。
3. **代码拉取**：`git clone` GitHub 慢/断时，用镜像地址，或在本地打包后 `scp` 上服务器。
4. **AI 助手**：`ANTHROPIC_API_KEY` 大陆直连不可用——要么留空（自动降级为演示模式），要么让服务器出网走代理。

---

## 选择部署方式（按站长技术水平）

| 你是… | 走这条路 |
| --- | --- |
| **技术小白站长**（不想碰命令行） | **面板可视化部署**：[1Panel 图文教程](INSTALL-1panel.md) 或 [宝塔面板图文教程](INSTALL-bt.md)。面板负责装 Docker、反代、HTTPS 与自动续期；你只需把本仓库 `docker-compose.yml` 贴进面板的「Compose 编排」、填几个变量点启动。 |
| **AI 编码助手**（Claude Code / Codex 等） | 按下面第 0–9 节命令流程自主部署，每步都有校验闸门。 |
| **会命令行的运维** | 同上 CLI 流程；非 Docker 裸机见 [INSTALL.md](INSTALL.md)。 |

> 面板路径最适合非技术客户：可复现、客户后续能自己在面板里点「更新 / 备份」。**AI 助手代客户部署时，也建议优先落到面板路径**（交付后客户能自己维护），仅在无面板时才走纯 CLI。

---

## 0. 先向人类确认这些输入（缺一不可）

执行前先问清楚，不要擅自假设：

| 输入 | 用途 | 缺省/示例 |
| --- | --- | --- |
| 服务器 SSH 访问 | 你要在上面跑命令 | 必填 |
| 是否大陆服务器 | 决定是否启用 npm/镜像国内加速 | 影响构建成败 |
| 域名（可选） | 绑定 + HTTPS；没有就先用 `IP:端口` | 可后补 |
| 对外端口 | 默认 `4000`（只绑 `127.0.0.1`，经反代暴露） | `APP_PORT` |
| 是否要 AI 助手 / 对象存储 | 决定是否配 `ANTHROPIC_API_KEY` / `S3_*` | 都可选 |

**强随机串**（`JWT_SECRET`、`DB_PASSWORD`）你自己用以下命令生成，不要让人类手敲弱密码：
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
# 无 node 时：openssl rand -base64 36 | tr -d '/+=' | cut -c1-48
```

---

## 1. 前置依赖

需要：**Docker + Docker Compose v2**、`git`。校验：
```bash
docker --version && docker compose version && git --version
```
✅ 三条都打印版本号即通过。缺 Docker 就先装（Debian/Ubuntu：`curl -fsSL https://get.docker.com | sh`）。

---

## 2. 取代码

```bash
cd /opt        # 或 /www/wwwroot（宝塔）等
git clone https://github.com/xhwwstudio/bananasns.git bananasns && cd bananasns
```
✅ `ls docker-compose.yml .env.example Dockerfile` 三个文件都在 → 通过。

---

## 3. 配置 `.env`（关键一步）

```bash
cp .env.example .env
```
然后**编辑 `.env`**，至少设置：
- `JWT_SECRET=<上面生成的强随机串>`
- `DB_PASSWORD=<上面生成的强随机串>`
- `APP_PORT=4000`（端口冲突就改）
- **大陆服务器**：取消注释 `NPM_REGISTRY=https://registry.npmmirror.com`，并给 Docker 配国内镜像加速。
- 可选：`ANTHROPIC_API_KEY=`（配了才启用 AI 助手）、`S3_ENDPOINT/S3_BUCKET/S3_ACCESS_KEY/S3_SECRET_KEY`（配了走对象存储，否则上传存本地命名卷）。

校验（确认占位符已被替换、无中文占位残留）：
```bash
grep -E '^(JWT_SECRET|DB_PASSWORD)=' .env
```
✅ 两个值都是真随机串、不含「请改成」字样 → 通过。

---

## 4. 构建并启动

```bash
docker compose up -d --build      # 首次构建前端+后端镜像 + 拉起 mariadb/redis，约 3–8 分钟
```
校验容器健康：
```bash
docker compose ps                 # app / bananasns-mariadb / bananasns-redis 都应 Up（db/redis 为 healthy）
```
✅ 三个容器都 Up，mariadb/redis 显示 healthy → 通过。若 `app` 反复重启，看日志：`docker compose logs app --tail=50`（多半是连不上库或环境变量缺失）。

---

## 5. 健康校验闸门（必须通过才算部署成功）

```bash
curl -s http://127.0.0.1:4000/api/health      # 期望 {"ok":true,"app":"BananaSNS"}
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4000/        # 期望 200（前端 SPA）
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4000/api/posts   # 期望 200（API）
```
✅ health 返回 `{"ok":true,...}`、SPA 与 `/api/posts` 都 200 → **部署成功**。
> 注意 API 根路径是 `/api/posts`（不是 `/api/feed`）。`DB_SYNCHRONIZE=true` 会在首启自动建表，无需手动迁移。

---

## 6. 创建管理员（数据库初始为空）

全新库没有任何用户。两种方式，**推荐 A（全自动，免手动 SQL）**：

**A. 首启自动建管理员（推荐）** —— 在第 3 步 `.env` 里加这两行，再 `docker compose up -d`（或重建）即可：
```bash
SEED_ADMIN_USER=admin
SEED_ADMIN_PASSWORD=<强密码，≥6 位>
```
首启时库里若还没有任何管理员，会自动创建该 admin（已有管理员则忽略，幂等安全）。校验：
```bash
curl -s -X POST http://127.0.0.1:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"<上面的强密码>"}'    # 期望返回 {"token":"..."}
```
✅ 拿到 token、且该账号能进 `/admin` → 通过。**登录后请尽快改密**。

**B. 手动提权（不想用 env 时）** —— 先在前台注册一个账号，再提成管理员：
```bash
docker exec bananasns-mariadb mariadb -ubananasns -p"$DB_PASSWORD" bananasns \
  -e "UPDATE users SET role='admin' WHERE username='<注册的用户名>';"
```
> `$DB_PASSWORD` 需在当前 shell 可见（`set -a; . .env; set +a` 可从 `.env` 载入）。

✅ 该账号刷新后右上角可进入 `/admin` 管理后台 → 通过。（后台可配：模块开关、页面布局、快报/导航内容、支付网关、外观、安全等。）

---

## 7. 绑域名 + HTTPS（有域名时）

容器只监听 `127.0.0.1:4000`，用面板或 Nginx 反向代理到它：
```nginx
location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    client_max_body_size 30m;   # 否则大文件上传被拦
}
```
再签发 Let's Encrypt 证书、开强制 HTTPS。✅ `https://你的域名/api/health` 返回 ok → 通过。

---

## 8. 更新 / 备份（运维）

```bash
# 更新：拉新代码重建（数据在命名卷里，不丢）
cd /opt/bananasns && git pull && docker compose up -d --build

# 备份：数据库 + 上传媒体
docker exec bananasns-mariadb mariadb-dump -ubananasns -p"$DB_PASSWORD" bananasns > backup-$(date +%F).sql
docker run --rm -v bananasns_bananasns-uploads:/u -v "$PWD":/b alpine tar czf /b/uploads-$(date +%F).tgz -C /u .
```
数据卷：`bananasns_bananasns-db`（库）/ `bananasns_bananasns-redis`（缓存）/ `bananasns_bananasns-uploads`（上传）。

---

## 9. 排障速查（AI 自检顺序）

| 现象 | 你应该检查 |
| --- | --- |
| `app` 反复重启 | `docker compose logs app --tail=80`；多半 `JWT_SECRET`/`DB_PASSWORD` 没设，或 mariadb 未就绪 |
| health 不通 | 容器是否 Up？端口被占？`APP_PORT` 改了吗？ |
| 打开白屏/404 | 镜像构建是否成功（前端 `client/dist` 是否打进镜像）？看 `docker compose logs app` |
| 连不上数据库 | compose 内 `DB_HOST` 必须是 `mariadb`（容器名），不是 `127.0.0.1` |
| 大陆构建慢/失败 | `.env` 的 `NPM_REGISTRY` 是否取消注释？Docker 镜像加速配了吗？ |
| 上传失败 | 反代 `client_max_body_size ≥ 30m`；磁盘是否满 |

---

## 10. 非 Docker（宝塔 Node 项目 / 裸机）

若环境不便用 Docker：需自备 **Node 20 + MySQL8/MariaDB10.6+ + Redis7**，分别 `cd client && npm i && npm run build`、`cd server-nest && npm i && npm run build`，再用 PM2/systemd 跑 `node server-nest/dist/main.js` 并注入环境变量（`DB_* / REDIS_URL / JWT_SECRET / PORT / CLIENT_DIST=…/client/dist / UPLOADS_DIR`）。详见 [INSTALL.md](INSTALL.md) 与 [INSTALL-bt.md](INSTALL-bt.md)（方式 B）。

---

**成功判定（给 AI 的最终自检）**：第 5 步三条校验全过 + 第 6 步管理员能进后台 = 部署完成。把 health 输出、容器状态、访问地址回报给人类。
