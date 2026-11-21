import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

import jwt
from fastapi import Cookie, Depends, HTTPException, Response
from pwdlib import PasswordHash
from sqlalchemy.orm import Session

from app.auth.models import User
from app.config import settings
from app.db import get_db

COOKIE = "mirrorly_session"
hasher = PasswordHash.recommended()  # argon2


def set_session_cookie(response: Response, user_id: uuid.UUID) -> None:
    exp = datetime.now(UTC) + timedelta(days=settings.jwt_days)
    token = jwt.encode({"sub": str(user_id), "exp": exp}, settings.jwt_secret, algorithm="HS256")
    response.set_cookie(
        COOKIE, token, max_age=settings.jwt_days * 86400,
        httponly=True, secure=settings.cookie_secure, samesite="lax",
    )


def current_user(
    db: Annotated[Session, Depends(get_db)],
    token: Annotated[str | None, Cookie(alias=COOKIE)] = None,
) -> User:
    unauthorized = HTTPException(401, "Not authenticated")
    if not token:
        raise unauthorized
    try:
        user_id = uuid.UUID(jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise unauthorized
    user = db.get(User, user_id)
    if not user:
        raise unauthorized
    return user


CurrentUser = Annotated[User, Depends(current_user)]
DB = Annotated[Session, Depends(get_db)]
