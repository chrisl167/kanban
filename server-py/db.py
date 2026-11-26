"""SQLite data layer for the Kanban Python backend."""
import json
import os
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path

DATA_DIR = Path(os.environ.get("KANBAN_DATA_DIR", "/opt/kanban/data"))
DB_PATH = DATA_DIR / "kanban.db"
SESSION_DAYS = 7

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL DEFAULT '',
    board_title TEXT NOT NULL DEFAULT '服药与工作看板',
    theme TEXT NOT NULL DEFAULT 'system',
    must_change_password INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'todo',
    priority TEXT NOT NULL DEFAULT 'normal',
    category TEXT NOT NULL DEFAULT 'other',
    due_date TEXT,
    due_time TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    sort_order INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id, status, sort_order);
"""

USER_COLUMNS = {
    "display_name": "TEXT NOT NULL DEFAULT ''",
    "board_title": "TEXT NOT NULL DEFAULT '服药与工作看板'",
    "theme": "TEXT NOT NULL DEFAULT 'system'",
    "must_change_password": "INTEGER NOT NULL DEFAULT 0",
}


def now_iso():
    return datetime.now().isoformat(timespec="seconds")


def connect():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(DB_PATH), timeout=10)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA foreign_keys=ON")
    return con


def init_db():
    with connect() as con:
        con.executescript(SCHEMA)
        existing = {row["name"] for row in con.execute("PRAGMA table_info(users)")}
        migrated = False
        for column, declaration in USER_COLUMNS.items():
            if column not in existing:
                con.execute(f"ALTER TABLE users ADD COLUMN {column} {declaration}")
                migrated = True
        if migrated:
            con.execute("UPDATE users SET must_change_password = 1 WHERE must_change_password = 0")


def user_profile(row):
    if not row:
        return None
    return {
        "id": row["id"],
        "email": row["email"],
        "display_name": row["display_name"] or "",
        "board_title": row["board_title"] or "服药与工作看板",
        "theme": row["theme"] or "system",
        "must_change_password": bool(row["must_change_password"]),
        "created_at": row["created_at"],
    }


def normalize_task(row):
    if not row:
        return None
    try:
        tags = json.loads(row["tags"] or "[]")
    except Exception:
        tags = []
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"] or "",
        "status": row["status"],
        "priority": row["priority"],
        "category": row["category"],
        "due_date": row["due_date"] or "",
        "due_time": row["due_time"] or "",
        "tags": tags if isinstance(tags, list) else [],
        "sort_order": row["sort_order"] or 0,
        "completed_at": row["completed_at"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def new_id():
    return str(uuid.uuid4())
