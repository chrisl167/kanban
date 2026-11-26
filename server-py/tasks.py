"""Task validation and SQLite CRUD for the Kanban backend."""
import json

from db import connect, new_id, normalize_task, now_iso

STATUS = {"todo", "doing", "done"}
PRIORITY = {"low", "normal", "high", "urgent"}
CATEGORY = {"medication", "work", "personal", "other"}


def _validate(body: dict):
    title = str(body.get("title") or "").strip()
    if not title:
        raise ValueError("事项名称不能为空")

    status = body.get("status") if body.get("status") in STATUS else "todo"
    priority = body.get("priority") if body.get("priority") in PRIORITY else "normal"
    category = body.get("category") if body.get("category") in CATEGORY else "other"
    tags = body.get("tags")
    tags = [str(tag) for tag in tags] if isinstance(tags, list) else []

    try:
        sort_order = int(body.get("sort_order") or 0)
    except (TypeError, ValueError):
        sort_order = 0

    return {
        "title": title,
        "description": str(body.get("description") or "").strip(),
        "status": status,
        "priority": priority,
        "category": category,
        "due_date": body.get("due_date") or None,
        "due_time": body.get("due_time") or None,
        "tags": json.dumps(tags, ensure_ascii=False),
        "sort_order": sort_order,
        "completed_at": now_iso() if status == "done" else None,
    }


def list_tasks(user_id: str):
    with connect() as con:
        rows = con.execute(
            "SELECT * FROM tasks WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC",
            (user_id,),
        ).fetchall()
    return [normalize_task(row) for row in rows]


def create_task(user_id: str, body: dict):
    task = _validate(body)
    task_id = new_id()
    now = now_iso()
    with connect() as con:
        con.execute(
            """
            INSERT INTO tasks (
                id, user_id, title, description, status, priority, category,
                due_date, due_time, tags, sort_order, completed_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                task_id,
                user_id,
                task["title"],
                task["description"],
                task["status"],
                task["priority"],
                task["category"],
                task["due_date"],
                task["due_time"],
                task["tags"],
                task["sort_order"],
                task["completed_at"],
                now,
                now,
            ),
        )
        row = con.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    return normalize_task(row)


def update_task(user_id: str, task_id: str, body: dict):
    with connect() as con:
        existing = con.execute(
            "SELECT * FROM tasks WHERE id = ? AND user_id = ?", (task_id, user_id)
        ).fetchone()
        if not existing:
            raise LookupError("任务不存在")
        existing = dict(existing)
        try:
            existing["tags"] = json.loads(existing.get("tags") or "[]")
        except Exception:
            existing["tags"] = []
        body_clean = {key: value for key, value in body.items() if value is not None}
        task = _validate({**existing, **body_clean})
        now = now_iso()
        con.execute(
            """
            UPDATE tasks SET title=?, description=?, status=?, priority=?, category=?,
                due_date=?, due_time=?, tags=?, sort_order=?, completed_at=?, updated_at=?
            WHERE id=? AND user_id=?
            """,
            (
                task["title"],
                task["description"],
                task["status"],
                task["priority"],
                task["category"],
                task["due_date"],
                task["due_time"],
                task["tags"],
                task["sort_order"],
                task["completed_at"],
                now,
                task_id,
                user_id,
            ),
        )
        row = con.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    return normalize_task(row)


def delete_task(user_id: str, task_id: str):
    with connect() as con:
        result = con.execute(
            "DELETE FROM tasks WHERE id = ? AND user_id = ?", (task_id, user_id)
        )
        if result.rowcount == 0:
            raise LookupError("任务不存在")
