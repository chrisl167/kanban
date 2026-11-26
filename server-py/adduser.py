"""Create a local kanban account without enabling public registration."""
import argparse
import getpass

import auth
import db


def main():
    parser = argparse.ArgumentParser(description="Create a Kanban account")
    parser.add_argument("email", nargs="?")
    parser.add_argument("password", nargs="?")
    parser.add_argument(
        "--no-must-change",
        action="store_true",
        help="Do not force the user to change the initial password on first login.",
    )
    args = parser.parse_args()

    db.init_db()
    email = (args.email or input("Email: ")).strip().lower()
    password = args.password or getpass.getpass("Password: ")

    if len(email) < 3 or len(password) < 6:
        raise SystemExit("邮箱至少 3 个字符，密码至少 6 个字符")
    if auth.get_user_with_hash(email):
        raise SystemExit("邮箱已存在；如需重置密码，请直接操作数据库或先删除该账号")

    user = auth.create_user(email, password, must_change_password=not args.no_must_change)
    force_text = "首次登录需修改密码" if user["must_change_password"] else "不强制首次改密"
    print(f"Created user: {user['email']} ({force_text})")


if __name__ == "__main__":
    main()
