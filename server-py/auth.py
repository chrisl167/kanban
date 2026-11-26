"""PBKDF2 password hashing and bearer session tokens."""
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta

from db import SESSION_DAYS, connect, new_id, now_iso

ITERATIONS = 200_000


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


def get_user_by_email(email: str):
    with connect() as con:
        row = con.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        return dict(row) if row else None


def create_user(email: str, password: str):
    user_id = new_id()
    with connect() as con:
        con.execute(
            "INSERT INTO users(id, email, password_hash) VALUES (?, ?, ?)",
            (user_id, email, hash_password(password)),
        )
    return {"id": user_id, "email": email}


def session_user(authorization: str | None):
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization[7:].strip()
    if not token:
        return None
    with connect() as con:
        row = con.execute(
            """
            SELECT u.id, u.email
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token = ? AND s.expires_at > ?
            """,
            (token, now_iso()),
        ).fetchone()
    return dict(row) if row else None
