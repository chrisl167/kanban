#!/bin/sh
# 看板独立随机 Tunnel 的可执行包装器；供 start-stop-daemon 按独立脚本路径后台拉起。
exec /root/cloudflared/cloudflared tunnel \
  --url http://127.0.0.1:8766 \
  --protocol http2 \
  --no-autoupdate \
  >> /mnt/sata2-4/kanban/tunnel.log 2>&1
