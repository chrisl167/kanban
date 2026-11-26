#!/bin/sh
# 生成长期部署压缩包：前端构建产物、Python FastAPI 后端源码和部署配置。
# 不含 node_modules、本地数据库、.git 与压缩包自身。

set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

npm install
npm run build

OUT="$ROOT/deploy/kanban-deploy.tar.gz"
TMP_OUT="/tmp/kanban-deploy.tar.gz"
rm -f "$OUT" "$TMP_OUT"

tar -czf "$TMP_OUT" \
  --exclude='node_modules' \
  --exclude='server/node_modules' \
  --exclude='server/data' \
  --exclude='server-py/data' \
  --exclude='server-py/__pycache__' \
  --exclude='.git' \
  --exclude='deploy/kanban-deploy.tar.gz' \
  index.html \
  package.json \
  package-lock.json \
  vite.config.js \
  dist \
  server-py \
  src \
  deploy

mv "$TMP_OUT" "$OUT"
echo "Package ready: $OUT"
