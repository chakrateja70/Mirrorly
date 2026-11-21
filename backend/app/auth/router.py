from fastapi import APIRouter, HTTPException, Response
from sqlalchemy import select

from app.auth.models import User
from app.auth.schemas import LoginIn, RegisterIn, UserOut
from app.auth.security import COOKIE, DB, CurrentUser, hasher, set_session_cookie
from app.expenses.service import seed_default_categories

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=201)
def register(body: RegisterIn, response: Response, db: DB):
    email = body.email.lower()
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(409, "Email already registered")
    user = User(email=email, password_hash=hasher.hash(body.password), name=body.name, currency=body.currency)
    db.add(user)
    db.flush()
    seed_default_categories(db, user.id)
    db.commit()
    set_session_cookie(response, user.id)
    return user


@router.post("/login", response_model=UserOut)
def login(body: LoginIn, response: Response, db: DB):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not hasher.verify(body.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")
    set_session_cookie(response, user.id)
    return user


@router.post("/logout", status_code=204)
def logout(response: Response):
    response.delete_cookie(COOKIE)


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user
