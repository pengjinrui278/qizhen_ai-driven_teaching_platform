"""平台身份提供方。口令 PBKDF2、随机会话、HttpOnly cookie；角色不信任客户端。"""
import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, Request
from sqlalchemy import select

from .config import get_settings
from .platform_models import Account, LoginSession

COOKIE = "mirror_session"


def aware(value):
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


def password_hash(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 600000).hex()
    return f"{salt}:{digest}"


def password_matches(password: str, value: str) -> bool:
    salt, expected = value.split(":")
    actual = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 600000).hex()
    return hmac.compare_digest(actual, expected)


def issue_session(db, account: Account) -> str:
    token = secrets.token_urlsafe(48)
    db.add(LoginSession(token_hash=hashlib.sha256(token.encode()).hexdigest(),
                        account_id=account.id,
                        expires_at=datetime.now(UTC) + timedelta(hours=get_settings().session_hours)))
    db.commit()
    return token


def current_account(request: Request, db) -> Account:
    token = request.cookies.get(COOKIE, "")
    if not token:
        raise HTTPException(401, "请先登录账号")
    row = db.get(LoginSession, hashlib.sha256(token.encode()).hexdigest())
    if not row or aware(row.expires_at) <= datetime.now(UTC):
        raise HTTPException(401, "登录已过期，请重新登录")
    user = db.get(Account, row.account_id)
    if not user or user.status == "deleted":
        raise HTTPException(401, "账号已删除")
    return user


def require_staff(user: Account):
    if user.role not in ("teacher", "ta"):
        raise HTTPException(403, "此操作需要教师或TA角色")


def require_active(user: Account):
    if user.status != "active":
        raise HTTPException(409, "学习档案已冻结，可导出或删除，不能继续写入")


def public_account(user):
    return {"id": user.id, "username": user.username, "nickname": user.nickname,
            "role": user.role, "status": user.status, "retention_days": user.retention_days}


def remove_sessions(db, user_id):
    db.query(LoginSession).filter_by(account_id=user_id).delete()
