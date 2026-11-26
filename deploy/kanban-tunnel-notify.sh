#!/bin/sh
# 看板随机 Tunnel 地址飞书通知。
# 开机后由 kanban-autostart.sh 调用；也可手动执行：
#   /opt/kanban/tunnel-notify.sh          # 等待新地址，地址未变则跳过
#   /opt/kanban/tunnel-notify.sh --force  # 忽略去重，立即发送当前地址

CFG=/root/health-app/config.json
LOG=/mnt/sata2-4/kanban/tunnel.log
STATE=/mnt/sata2-4/kanban/.last_tunnel_url
NOTIFY_LOG=/mnt/sata2-4/kanban/notify.log
LAN_URL="http://192.168.31.242:8766/"
FORCE=0

[ "$1" = "--force" ] && FORCE=1

LARK=$(sed -n 's/.*"lark_cli_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$CFG" 2>/dev/null | head -1)
[ -z "$LARK" ] && LARK=/root/.lark-cli-bin/lark-cli
OPENID=$(sed -n 's/.*"owner_open_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$CFG" 2>/dev/null | head -1)

ts() { date '+%Y-%m-%d %H:%M:%S'; }

mkdir -p "$(dirname "$NOTIFY_LOG")"
echo "$(ts) kanban tunnel-notify 启动 (force=$FORCE)" >> "$NOTIFY_LOG"

if [ -z "$OPENID" ]; then
  echo "$(ts) 未从 $CFG 读取到 owner_open_id，放弃通知" >> "$NOTIFY_LOG"
  exit 1
fi

# 最多等待 120 秒，直到看板 Tunnel 日志出现 trycloudflare 地址。
URL=""
i=0
while [ "$i" -lt 60 ]; do
  URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" 2>/dev/null | head -1)
  [ -n "$URL" ] && break
  sleep 2
  i=$((i + 1))
done

if [ -z "$URL" ]; then
  echo "$(ts) 未获取到看板隧道地址，放弃通知" >> "$NOTIFY_LOG"
  exit 1
fi

if [ "$FORCE" -eq 0 ] && [ -f "$STATE" ] && [ "$(cat "$STATE")" = "$URL" ]; then
  echo "$(ts) 地址未变 ($URL)，跳过通知" >> "$NOTIFY_LOG"
  exit 0
fi

MSG="【工作看板】外网隧道地址已更新：$URL ｜ 局域网地址：$LAN_URL ｜ 时间：$(ts)"
"$LARK" im +messages-send --as bot --user-id "$OPENID" --text "$MSG" >> "$NOTIFY_LOG" 2>&1
RC=$?

if [ "$RC" -eq 0 ]; then
  echo "$URL" > "$STATE"
  echo "$(ts) 已通知并记录：$URL" >> "$NOTIFY_LOG"
else
  echo "$(ts) 飞书通知失败 rc=$RC" >> "$NOTIFY_LOG"
fi

exit "$RC"
