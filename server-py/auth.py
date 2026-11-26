"""PBKDF2 password hashing, bearer sessions, and profile helpers."""
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta

from db import SESSION_DAYS, connect, new_id, now_iso, user_profile

ITERATIONS = 200_000
THEMES = {"light", "dark", "system"}


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, ITERATIONS)
    return f"pbkdf2_sha256${ITERATIONS}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iterations, salt_hex, hash_hex = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            bytes.fromhex(salt_hex),
            int(iterations),
        )
        return hmac.compare_digest(dk.hex(), hash_hex)
    except Exception:
        return False


def create_session(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    expires = datetime.now() + timedelta(days=SESSION_DAYS)
    with connect() as con:
        con.execute(
            "INSERT INTO sessions(token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (token, user_id, now_iso(), expires.isoformat(timespec="seconds")),
        )
    return token


def delete_session(token: str):
    with connect() as con:
        con.execute("DELETE FROM sessions WHERE token = ?", (token,))


def get_user_with_hash(email: str):
    with connect() as con:
        row = con.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        return dict(row) if row else None


def get_profile(user_id: str):
    with connect() as con:
        row = con.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return user_profile(row)


def create_user(email: str, password: str, must_change_password: bool = False):
    user_id = new_id()
    with connect() as con:
        con.execute(
            """
            INSERT INTO users(id, email, password_hash, must_change_password)
            VALUES (?, ?, ?, ?)
            """,
            (user_id, email, hash_password(password), 1 if must_change_password else 0),
        )
    return get_profile(user_id)


def session_user(authorization: str | None):
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization[7:].strip()
    if not token:
        return None
    with connect() as con:
        row = con.execute(
            """
            SELECT u.*
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token = ? AND s.expires_at > ?
            """,
            (token, now_iso()),
        ).fetchone()
    return user_profile(row)


def update_password(user_id: str, new_password: str):
    with connect() as con:
        con.execute(
            """
            UPDATE users
            SET password_hash = ?, must_change_password = 0
            WHERE id = ?
            """,
            (hash_password(new_password), user_id),
        )


def update_profile(user_id: str, data: dict):
    display_name = str(data.get("display_name") or "").strip()[:60]
    board_title = str(data.get("board_title") or "").strip()[:80]
    theme = data.get("theme") if data.get("theme") in THEMES else "system"

    with connect() as con:
        con.execute(
            """
            UPDATE users
            SET display_name = ?, board_title = ?, theme = ?
            WHERE id = ?
            """,
            (display_name, board_title or "服药与工作看板", theme, user_id),
        )
    return get_profile(user_id)
