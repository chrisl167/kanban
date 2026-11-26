"""FastAPI Kanban backend for iStoreOS: SQLite + session bearer tokens + static frontend."""
import os
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import auth
import db
import tasks

ROOT = Path(__file__).resolve().parent
DIST_DIR = Path(os.environ.get("DIST_DIR", str(ROOT.parent / "dist")))
ALLOW_REGISTRATION = os.environ.get("ALLOW_REGISTRATION", "false").lower() == "true"

db.init_db()
app = FastAPI(title="Kanban Board API", docs_url=None, redoc_url=None)


class AuthBody(BaseModel):
    email: str = Field(min_length=3, max_length=120)
    password: str = Field(min_length=6, max_length=120)


class ProfileBody(BaseModel):
    display_name: str | None = Field(default=None, max_length=60)
    board_title: str | None = Field(default=None, max_length=80)
    theme: str | None = None


class PasswordBody(BaseModel):
    old_password: str = Field(min_length=6, max_length=120)
    new_password: str = Field(min_length=6, max_length=120)


class TaskBody(BaseModel):
    title: str | None = Field(default=None, max_length=80)
    description: str | None = None
    status: str | None = None
    priority: str | None = None
    category: str | None = None
    due_date: str | None = None
    due_time: str | None = None
    tags: list[str] | None = None
    sort_order: int = 0


def require_user(authorization: str | None = Header(default=None)):
    user = auth.session_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="未登录或登录已过期，请重新登录")
    return user


@app.get("/api/health")
def health():
    return {"ok": True, "service": "kanban-server", "time": db.now_iso()}


@app.get("/api/auth/config")
def auth_config():
    return {"allowRegistration": ALLOW_REGISTRATION}


@app.post("/api/auth/register")
def register(body: AuthBody):
    if not ALLOW_REGISTRATION:
        raise HTTPException(status_code=403, detail="注册已关闭；请联系管理员开通账号")
    email = body.email.strip().lower()
    if auth.get_user_with_hash(email):
        raise HTTPException(status_code=409, detail="邮箱已注册")
    user = auth.create_user(email, body.password, must_change_password=False)
    token = auth.create_session(user["id"])
    return {"token": token, "user": user}


@app.post("/api/auth/login")
def login(body: AuthBody):
    email = body.email.strip().lower()
    user = auth.get_user_with_hash(email)
    if not user or not auth.verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="邮箱或密码错误")
    token = auth.create_session(user["id"])
    return {"token": token, "user": auth.get_profile(user["id"])}


@app.post("/api/auth/logout")
def logout(authorization: str | None = Header(default=None), user=Depends(require_user)):
    if authorization and authorization.startswith("Bearer "):
        auth.delete_session(authorization[7:].strip())
    return {"ok": True}


@app.get("/api/me")
def get_me(user=Depends(require_user)):
    return auth.get_profile(user["id"])


@app.put("/api/me")
def update_profile(body: ProfileBody, user=Depends(require_user)):
    return auth.update_profile(user["id"], body.model_dump(exclude_none=True))


@app.post("/api/auth/password/change")
def change_password(body: PasswordBody, user=Depends(require_user)):
    if body.new_password == body.old_password:
        raise HTTPException(status_code=400, detail="新密码不能与当前密码相同")
    stored = auth.get_user_with_hash(user["email"])
    if not stored or not auth.verify_password(body.old_password, stored["password_hash"]):
        raise HTTPException(status_code=400, detail="当前密码不正确")
    auth.update_password(user["id"], body.new_password)
    return {"ok": True, "user": auth.get_profile(user["id"])}


@app.get("/api/tasks")
def list_tasks(user=Depends(require_user)):
    return tasks.list_tasks(user["id"])


@app.post("/api/tasks", status_code=201)
def create_task(body: TaskBody, user=Depends(require_user)):
    return tasks.create_task(user["id"], body.model_dump())


@app.put("/api/tasks/{task_id}")
def update_task(task_id: str, body: TaskBody, user=Depends(require_user)):
    try:
        return tasks.update_task(user["id"], task_id, body.model_dump())
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: str, user=Depends(require_user)):
    try:
        tasks.delete_task(user["id"], task_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return {"ok": True}


@app.exception_handler(ValueError)
def value_error_handler(_request, exc: ValueError):
    return JSONResponse({"error": str(exc)}, status_code=400)


if DIST_DIR.exists():
    app.mount("/", StaticFiles(directory=DIST_DIR, html=True), name="static")


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8766"))
    host = os.environ.get("HOST", "127.0.0.1")
    uvicorn.run(app, host=host, port=port, log_level="info")
