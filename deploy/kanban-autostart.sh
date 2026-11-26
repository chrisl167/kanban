#!/bin/sh
# 看板开机自启：等待网络后启动 Python 服务、独立随机 Tunnel，并推送新地址到飞书。
sleep 20

if ! ps | grep -q "[r]un.py"; then
  /opt/kanban/start-kanban.sh &
fi

if ! ps | grep -q "[c]loudflared.*8766"; then
  start-stop-daemon -S -b -x /opt/kanban/kanban-tunnel.sh
fi

/opt/kanban/tunnel-notify.sh &
