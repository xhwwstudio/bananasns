# 1Panel 部署教程

> 🧭 **不确定用哪种装法？** 先看 [安装方式速览](../README.md#-快速开始) 对号入座。
> 分路：[图形面板 · 1Panel](INSTALL-1panel.md) / [宝塔](INSTALL-bt.md)（**非技术用户推荐**） · [命令行 · Docker / 裸机](DEPLOY.md) · [完整安装手册](INSTALL.md) · [让 AI 助手代装](DEPLOY-AI.md) · [配置与维护参考](CONFIGURATION.md)


1Panel 是 Docker 化面板，BananaSNS 用一份 `docker-compose.yml` 一键起三个容器：`app`（NestJS 后端，单进程同时伺服 前端 + /api + /uploads）+ `mariadb`（数据库）+ `redis`（缓存），compose 已编排好依赖与健康检查。再用 1Panel 的反向代理绑域名即可。**你要配的只有：JWT 密钥 + 数据库密码 + 域名。**

> **🌏 大陆 / 国外** — **建议优先选非大陆机房（香港 / 新加坡 / 日本 / 美国等）**：镜像构建更顺、内置 AI 助手（Anthropic API）可用、且免 ICP 备案。必须用大陆时按下面两步绕过网络问题。
> - **大陆服务器**：① 在 1Panel「容器 → 配置 → 镜像加速」填一个国内 Docker 加速地址；② 把 `.env` 里的 `NPM_REGISTRY` 取消注释（用 npm 国内镜像）。否则拉基础镜像 / 装依赖会很慢甚至失败。（注：AI 助手在大陆直连不可用，需留空降级或自备代理。）
> - **国外服务器**：什么都不用改，直接用默认。

---

## 一、安装 1Panel + 准备

- 按官网命令安装 1Panel；登录后它会确保 Docker / Docker Compose 就绪。
- **大陆**：进「容器 → 镜像加速」配置国内加速器（按面板提示，一次性）。
- 备一个解析到服务器的域名（可选；没有先用 `IP:端口`）。

---

## 二、拉代码 + 配置（唯一要填的地方）

在 1Panel「主机 → 终端」（或 SSH）：

```bash
cd /opt        # 放哪都行
git clone https://github.com/xhwwstudio/bananasecret.git bananasns && cd bananasns

cp .env.example .env
# 编辑 .env：JWT_SECRET 和 DB_PASSWORD 都改成强随机串（生成命令见下）
#   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
# 【大陆】再把 .env 里这行取消注释：NPM_REGISTRY=https://registry.npmmirror.com
```

`.env` 里就这几项：`JWT_SECRET`（必改）、`DB_PASSWORD`（必改，数据库密码）、`APP_PORT`（默认 4000，冲突就改）、可选 `NPM_REGISTRY` / `ANTHROPIC_API_KEY` / `S3_*`（不配 S3 时上传存本地卷）。

---

## 三、起容器（二选一）

**方式 A — 1Panel 图形化（推荐）**：「容器 → 编排 → 创建编排」，来源选「本地目录」指到 `/opt/bananasns`（含 `docker-compose.yml`），确认并「构建 + 启动」。

**方式 B — 终端一条命令**：

```bash
cd /opt/bananasns
docker compose up -d --build
```

首次会构建镜像 + 拉起 mariadb/redis（几分钟），`app` 首启会自动建表（`DB_SYNCHRONIZE=true`）。完成后验证：

```bash
curl http://127.0.0.1:4000/api/health     # 应返回 {"ok":true,"app":"BananaSNS"}
```

数据库初始为空。**设首个管理员**两种方式任选：① 部署前在 `.env` 加 `SEED_ADMIN_USER` 与 `SEED_ADMIN_PASSWORD`，首启自动建管理员（库内已有管理员则忽略）；② 或先在站点注册一个账号，再在 mariadb 里把该用户 `role` 改成 `admin`（1Panel「容器 → mariadb → 终端」执行 `UPDATE users SET role='admin' WHERE username='你的账号';`）。

---

## 四、绑域名 + HTTPS（1Panel 反向代理）

1Panel「网站 → 创建网站 → 反向代理」：

- 域名：你的域名
- 代理地址：`http://127.0.0.1:4000`
- 创建后在该网站「HTTPS」里一键申请 Let's Encrypt 证书并开启强制 HTTPS。

浏览器打开域名即用。上传大文件如被拦，在该网站反代配置里把 `client_max_body_size` 调到 `30m`。

---

## 五、更新与数据

```bash
cd /opt/bananasns
git pull
docker compose up -d --build      # 重新构建并滚动重启
```

数据安全：数据库、缓存、上传都存在 Docker **命名卷**（`bananasns-db` = MariaDB 数据 / `bananasns-redis` / `bananasns-uploads`），`git pull` 与重建容器都不会丢；卷可在 1Panel「容器 → 存储卷」里查看与备份（生产建议定期 `docker exec bananasns-mariadb mariadb-dump ...` 备份数据库）。

---

## 六、常见问题

| 现象 | 排查 |
| --- | --- |
| 构建慢 / 拉镜像失败（大陆） | 配了镜像加速吗？`.env` 的 `NPM_REGISTRY` 取消注释了吗？ |
| 502 / 打不开 | `curl 127.0.0.1:4000/api/health` 通吗？反代地址是否 `http://127.0.0.1:4000`？ |
| 端口冲突 | 改 `.env` 的 `APP_PORT`，重新 `docker compose up -d`。 |
| 上传失败 | 反代里 `client_max_body_size` ≥ `30m`。 |

---

> 后端为 `server-nest/`（NestJS + TypeORM + MariaDB + Redis），compose 已把数据库/缓存一并起好，无需另外装。要接对象存储（S3/MinIO/rustfs）在 `.env` 配 `S3_*` 即可，不配则上传走本地卷。
