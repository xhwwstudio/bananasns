#!/usr/bin/env bash
# 在生产服务器上运行：把已 scp 到 ~ 的 nest-full.tgz 部署到 ~/bananasns-nest 并重启 server-nest。
# 不含任何凭据，可安全提交。由本地 deploy-nest.sh(gitignored, 含 SSH 凭据) 调用：
#   cd server-nest && npm run build
#   tar czf /tmp/nest-full.tgz dist package.json scripts
#   scp /tmp/nest-full.tgz tt@HOST:~/  &&  ssh ... 'bash ~/bananasns-nest/scripts/redeploy.sh'
#
# systemd unit(bananasns, :5388) 已指向 ~/bananasns-nest/dist/main.js + EnvironmentFile .nest-env，
# 故部署只需替换 dist 再重启。切勿运行旧 deploy.sh(它会把后端覆写回 Express)。
set -euo pipefail

NEST_DIR=/home/tt/bananasns-nest
TGZ="${1:-$HOME/nest-full.tgz}"

[ -f "$TGZ" ] || { echo "❌ 找不到 $TGZ (先 scp 上来)"; exit 1; }

echo "▶ 解包 $TGZ → $NEST_DIR"
tar xzf "$TGZ" -C "$NEST_DIR" 2>/dev/null
chmod +x "$NEST_DIR"/scripts/*.sh 2>/dev/null || true

echo "▶ 重启 server-nest"
systemctl --user restart bananasns
sleep 6

B=http://127.0.0.1:5388
H=$(curl -s --noproxy '*' "$B/api/health" || true)
FEED=$(curl -s --noproxy '*' "$B/api/posts" | grep -o '"id":[0-9]*' | wc -l || true)
SPA=$(curl -s --noproxy '*' -o /dev/null -w '%{http_code}' "$B/" || true)
echo "   health=$H  feed_ids=$FEED  spa=$SPA"
if echo "$H" | grep -q '"ok":true' && [ "$FEED" -gt 0 ] && [ "$SPA" = 200 ]; then
  echo "✅ redeploy 成功"
else
  echo "❌ redeploy 健康检查未过 — 查 journalctl --user -u bananasns -n 50；必要时 rollback-to-express.sh"
  exit 1
fi
