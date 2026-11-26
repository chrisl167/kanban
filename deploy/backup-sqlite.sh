#!/bin/sh
# SQLite 备份脚本：复制 WAL 模式下的数据库文件，并保留最近 14 份备份。
# 建议在 iStoreOS 计划任务中每天执行一次。

set -eu

DATA_DIR="${KANBAN_DATA_DIR:-/opt/kanban/data}"
BACKUP_DIR="${KANBAN_BACKUP_DIR:-/opt/kanban/backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
TARGET_DIR="$BACKUP_DIR/$STAMP"

mkdir -p "$TARGET_DIR"

if [ -f "$DATA_DIR/kanban.db" ]; then
  cp "$DATA_DIR/kanban.db" "$TARGET_DIR/"
fi

for suffix in wal shm; do
  if [ -f "$DATA_DIR/kanban.db-$suffix" ]; then
    cp "$DATA_DIR/kanban.db-$suffix" "$TARGET_DIR/"
  fi
done

# 只保留最近 14 个备份目录
ls -1dt "$BACKUP_DIR"/*/ 2>/dev/null | tail -n +15 | xargs -r rm -rf

echo "Backup completed: $TARGET_DIR"
