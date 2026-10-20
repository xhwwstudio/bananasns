# Deployment / 部署

> 🧭 **不确定用哪种装法？** 先看 [安装方式速览](../README.md#-快速开始) 对号入座。
> 分路：[图形面板 · 1Panel](INSTALL-1panel.md) / [宝塔](INSTALL-bt.md)（**非技术用户推荐**） · [命令行 · Docker / 裸机](DEPLOY.md) · [完整安装手册](INSTALL.md) · [让 AI 助手代装](DEPLOY-AI.md) · [配置与维护参考](CONFIGURATION.md)


BananaSNS 后端是 **server-nest**（NestJS + TypeORM + MySQL/MariaDB + Redis），`app` 进程同时伺服
`/api`、构建后的 SPA 与 `/uploads`——同一个端口。生产部署有两条路：

- **Docker Compose（推荐，最省事）** —— 一份 `docker-compose.yml` 起 `app + mariadb + redis`，
  数据库/缓存一并起好。面板图文教程：[INSTALL-1panel.md](INSTALL-1panel.md) / [INSTALL-bt.md](INSTALL-bt.md)。
- **裸机 systemd（不用 Docker）** —— 自备 MySQL/Redis，把 server-nest 跑成 systemd 服务，见下。

> 把所有 `<占位符>` 换成你自己的值。切勿把真实主机/密码/密钥提交到代码库。

---

## 方式 A：Docker Compose

```bash
cp .env.example .env        # 设 JWT_SECRET、DB_PASSWORD（大陆可设 NPM_REGISTRY 加速）
docker compose up -d --build
curl http://127.0.0.1:4000/api/health   # {"ok":true,"app":"BananaSNS"}
```

`app` 首启自动建表（`DB_SYNCHRONIZE=true`）。数据库/缓存/上传存于命名卷
（`bananasns-db` / `bananasns-redis` / `bananasns-uploads`），重建容器不丢。用面板反向代理把域名转发到
`127.0.0.1:4000` 并申请 HTTPS；大文件上传把反代 `client_max_body_size` 调到 `30m`。
更新：`git pull && docker compose up -d --build`。备份：`docker exec bananasns-mariadb mariadb-dump …`。

---

## 方式 B：裸机 systemd（自备 MySQL/Redis）

### 1. 准备
- **Node.js 18+**（推荐 20 LTS）、**MySQL/MariaDB**、**Redis**。
- 建库 `bananasns` 与用户/密码。
- 一个非 root 部署用户，拥有应用目录（如 `/home/<deploy-user>/bananasns`）。

### 2. 构建
```bash
git clone https://github.com/xhwwstudio/bananasns.git bananasns && cd bananasns
npm run install:all          # 装 server-nest + client 依赖
npm run build                # 构建前端(client/dist) + 编译后端(server-nest/dist)
```

### 3. 环境变量（写进 systemd unit 的 EnvironmentFile 或 Environment=）
| 变量 | 说明 |
| --- | --- |
| `JWT_SECRET` | **必设**，强随机串（`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`） |
| `PORT` | 监听端口，如 `4000` |
| `DB_CLIENT`/`DB_HOST`/`DB_PORT` | `mysql` / `127.0.0.1` / `3306` |
| `DB_USER`/`DB_PASSWORD`/`DB_NAME` | MySQL 用户/密码/库（`bananasns`） |
| `DB_SYNCHRONIZE` | 首次部署设 `true` 让 TypeORM 按实体自动建表（**本项目无独立迁移脚本**，表结构靠 synchronize 生成）；建表完成后改回 `false` |
| `REDIS_URL` | `redis://127.0.0.1:6379`（有密码：`redis://:pw@127.0.0.1:6379`） |
| `CLIENT_DIST` | `<repo>/client/dist`（伺服前端） |
| `UPLOADS_DIR` | 本地上传目录（未配 `S3_*` 时用）；配了 `S3_ENDPOINT/S3_BUCKET/S3_ACCESS_KEY/S3_SECRET_KEY` 则走对象存储 |
| `SEED_ADMIN_USER`/`SEED_ADMIN_PASSWORD` | 可选：两项都设且库内无管理员时，首启自动建管理员（见下「首个管理员」）。建好后可去掉 |
| `NODE_ENV` | `production` |

### 4. systemd unit（`~/.config/systemd/user/bananasns.service`，或系统级）
```ini
[Unit]
Description=BananaSNS (NestJS)
After=network.target

[Service]
WorkingDirectory=/home/<deploy-user>/bananasns/server-nest
EnvironmentFile=/home/<deploy-user>/bananasns/server-nest/.env
ExecStart=/usr/bin/node /home/<deploy-user>/bananasns/server-nest/dist/main.js
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
```
```bash
systemctl --user daemon-reload && systemctl --user enable --now bananasns
curl http://127.0.0.1:4000/api/health
```
前面用 nginx/面板反代绑域名 + HTTPS（转发到 `PORT`）。

### 5. 更新
```bash
cd <repo> && git pull && npm run build && systemctl --user restart bananasns
```
数据在 MySQL（用 `mariadb-dump` 备份）、上传在 `UPLOADS_DIR` 或对象存储，更新切勿覆盖。

---

## 首个管理员（全新库为空）

全新部署没有任何用户，需要建出第一个管理员（两种方式通用于 Docker / 裸机）：

- **自动（推荐，免手 SQL）**：部署前设 `SEED_ADMIN_USER` 与 `SEED_ADMIN_PASSWORD` 两个环境变量
  （Docker 写进 `.env`；裸机写进 systemd 的 `EnvironmentFile`）。库里若还没有管理员，首启会自动创建该账号；
  已有管理员则忽略（幂等安全）。登录后请尽快改密，之后可去掉这两个变量。
  ```bash
  # 验证：拿到 token 即成功
  curl -s -X POST http://127.0.0.1:4000/api/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"username":"admin","password":"<你设的强密码>"}'
  ```
- **手动**：先在站点正常注册一个账号，再把它提成管理员：
  ```bash
  # Docker：$DB_PASSWORD 需在当前 shell 可见（set -a; . .env; set +a 可从 .env 载入）
  docker exec bananasns-mariadb mariadb -ubananasns -p"$DB_PASSWORD" bananasns \
    -e "UPDATE users SET role='admin' WHERE username='<注册的用户名>';"
  # 裸机：mysql -ubananasns -p bananasns -e "UPDATE users SET role='admin' WHERE username='<用户名>';"
  ```

管理员登录后右上角进 `/admin`：可配模块开关、页面布局、快报/导航、**支付网关（凭据走后台 `site_config`，
不入代码库）**、外观与安全等。

---

## 安全与生产加固（公网上线前）

应用已内置一层基础防护：JWT 鉴权、密码 `bcryptjs` 哈希、`class-validator` 入参校验、敏感词过滤、私信拉黑校验、支付密钥脱敏存 `site_config`，以及一组安全响应头（`X-Content-Type-Options: nosniff`、`X-Frame-Options: SAMEORIGIN`、`Referrer-Policy`，并关闭 `X-Powered-By`）。面向公网正式上线，建议再补齐以下几项（多在**反向代理 / 面板 / WAF** 层完成，与应用解耦）：

- **强密钥**：`JWT_SECRET` 用强随机串（`.env` 必填）；管理员用强密码（`SEED_ADMIN_*` 或首登后改密），接入真实支付后到后台关闭「演示充值」。
- **HTTPS + HSTS/CSP**：反代签发证书并强制 HTTPS；在反代开启 **HSTS**，按需配置 **CSP**（应用未内置 CSP，以免影响内联样式的 SPA，交由部署方按域名/CDN 实际情况下发）。
- **限流 / 防爆破**：应用**已内置两类限流**——① 按登录用户的业务频率（开启后台「频率限制」后，发动态每分/每时、发帖每分、私信每分超限返回 429）；② **按 IP 的防批量注册**（开启后台「防批量注册」后，单 IP 每日注册数 `reg_ip_max_per_day` 与两次注册最小间隔 `reg_min_interval_sec` 超限返回 429）。均管理员豁免、Redis 计数、故障 fail-open。仍不覆盖**登录爆破、CC/DDoS**（按 IP / 未登录的攻击面），建议在**反代 / WAF** 层另加请求限流与防 CC。
  > 注册按 IP 限流需要真实客户端 IP：直连部署（如 `IP:5388`）默认即对；**置于反代后**请设环境变量 `TRUST_PROXY=1`（或 `loopback`），让应用从 `X-Forwarded-For` 取客户端 IP，否则所有请求会被当成反代同一个 IP。
- **CORS**：默认放开（鉴权走 `Authorization` 头、非 Cookie，CSRF 面较小）；若你把前端单独部署到其它域名，建议在反代按来源做收敛。
- **数据库**：生产保持 `DB_SYNCHRONIZE=false`（首次建表后即关闭），避免启动时自动改表。
- **备份**：定期 `mariadb-dump` 备份库 + 备份 `UPLOADS_DIR`（或对象存储），并演练恢复。
- **上传**：反代 `client_max_body_size ≥ 30m`；监控磁盘水位（媒体/备份增长）。
- **凭据卫生**：`.env` 收紧权限、切勿提交；支付等敏感凭据只在后台填写（存 `site_config`，公开接口不回显）。

---

## 常见问题
| 现象 | 排查 |
| --- | --- |
| 打开 404/白屏 | `client/dist` 构建了吗？`CLIENT_DIST` 指对了吗？ |
| 接口 502 | `curl 127.0.0.1:<PORT>/api/health` 通吗？反代指对端口了吗？ |
| 启动连不上数据库 | `DB_*` 是否正确？MySQL/Redis 在运行吗？（Docker 方式 `DB_HOST=mariadb`） |
| 接口全 500 / 表不存在 | 首次部署是否以 `DB_SYNCHRONIZE=true` 启动过一次建表？（无独立迁移脚本，表靠 synchronize 生成） |
| 没有后台入口 / 进不去 `/admin` | 还没有管理员。见上「首个管理员」：设 `SEED_ADMIN_*` 自动建，或注册后 SQL 提权。 |
| 上传失败 | 反代 `client_max_body_size` ≥ `30m`。 |

> **站点设置（模块 / 布局 / 外观）无需数据库迁移**：这些设置存于通用的 `site_config` 键值表，由管理员在后台直接读写并即时生效，新增或修改设置项不涉及建表/改表。
