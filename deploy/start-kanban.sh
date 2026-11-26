#!/bin/sh
# iStoreOS 看板启动脚本：Python FastAPI + SQLite + 本地静态前端。
set -eu

APP_DIR="/opt/kanban"
SERVER_DIR="$APP_DIR/server-py"
DATA_DIR="/mnt/sata2-4/kanban/data"
LOG_DIR="/mnt/sata2-4/kanban"

mkdir -p "$DATA_DIR" "$LOG_DIR"

cd "$SERVER_DIR"
export PORT="${PORT:-8766}"
export HOST="${HOST:-0.0.0.0}"
export KANBAN_DATA_DIR="$DATA_DIR"
export DIST_DIR="$APP_DIR/app"
export ALLOW_REGISTRATION="${ALLOW_REGISTRATION:-false}"

exec python3 run.py >> "$LOG_DIR/server.log" 2>&1
