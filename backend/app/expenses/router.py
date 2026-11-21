import hmac
import math
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Annotated

import jwt
from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.auth.security import DB, CurrentUser
from app.config import settings
from app.expenses import schemas as s
from app.expenses.models import Category, Expense
from app.expenses.service import monthly_summary

router = APIRouter(tags=["expenses"])

NAME_TAKEN = "A category with this name already exists"
CATEGORY_IN_USE = "Category has expenses; move or delete them first"


def _owned(db, model, id: uuid.UUID, user):
    """Fetch a row owned by user. Another user's row is indistinguishable from a missing one."""
    row = db.get(model, id)
    if not row or row.user_id != user.id:
        raise HTTPException(404, f"{model.__name__} not found")
    return row


def _commit(db, conflict_msg: str, obj=None) -> None:
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, conflict_msg)
    if obj is not None:
        db.refresh(obj)  # return DB-normalized values (e.g. NUMERIC(12,2) -> "1000.00")


# ---- PIN lock: changing categories and budgets needs the PIN (settings.budget_pin) ----

UNLOCK_COOKIE = "mirrorly_unlock"
UNLOCK_FOR = timedelta(minutes=10)
MAX_TRIES, LOCKOUT = 5, timedelta(minutes=5)
# ponytail: wrong-PIN counts live in process memory (reset on restart, per worker); move to the DB for several workers
_wrong_pins: dict[uuid.UUID, tuple[int, datetime]] = {}


@router.post("/categories/unlock", status_code=204)
def unlock_categories(body: s.PinIn, response: Response, user: CurrentUser):
    """Correct PIN -> a 10-minute cookie scoped to /api/categories. 5 wrong tries lock it for 5 minutes."""
    now = datetime.now(UTC)
    wrong, last = _wrong_pins.get(user.id, (0, now))
    if wrong >= MAX_TRIES:
        if now - last < LOCKOUT:
            minutes = math.ceil((LOCKOUT - (now - last)).total_seconds() / 60)
            raise HTTPException(429, f"Too many wrong PINs. Try again in {minutes} min.")
        wrong = 0  # lockout over
    if not hmac.compare_digest(body.pin.encode(), settings.budget_pin.encode()):
        _wrong_pins[user.id] = (wrong + 1, now)
        left = MAX_TRIES - wrong - 1
        # 403, never 401: the frontend treats 401 as "logged out"
        raise HTTPException(403, f"Wrong PIN. {left} tr{'y' if left == 1 else 'ies'} left." if left else "Wrong PIN. Locked for 5 minutes.")
    _wrong_pins.pop(user.id, None)
    token = jwt.encode({"sub": str(user.id), "scope": "categories", "exp": now + UNLOCK_FOR}, settings.jwt_secret, algorithm="HS256")
    response.set_cookie(
        UNLOCK_COOKIE, token, max_age=int(UNLOCK_FOR.total_seconds()), path="/api/categories",
        httponly=True, secure=settings.cookie_secure, samesite="lax",
    )


def require_unlock(user: CurrentUser, token: Annotated[str | None, Cookie(alias=UNLOCK_COOKIE)] = None) -> None:
    try:
        claims = jwt.decode(token or "", settings.jwt_secret, algorithms=["HS256"])
        ok = claims.get("scope") == "categories" and claims.get("sub") == str(user.id)
    except jwt.PyJWTError:
        ok = False
    if not ok:
        raise HTTPException(403, "Enter the PIN to change categories and budgets.")


Unlocked = [Depends(require_unlock)]


# ---- categories ----

@router.get("/categories", response_model=list[s.CategoryOut])
def list_categories(db: DB, user: CurrentUser):
    return db.scalars(select(Category).where(Category.user_id == user.id).order_by(Category.name)).all()


@router.post("/categories", response_model=s.CategoryOut, status_code=201, dependencies=Unlocked)
def create_category(body: s.CategoryIn, db: DB, user: CurrentUser):
    cat = Category(user_id=user.id, **body.model_dump())
    db.add(cat)
    _commit(db, NAME_TAKEN, cat)
    return cat


@router.patch("/categories/{id}", response_model=s.CategoryOut, dependencies=Unlocked)
def update_category(id: uuid.UUID, body: s.CategoryPatch, db: DB, user: CurrentUser):
    cat = _owned(db, Category, id, user)
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is None and k != "monthly_budget":
            continue  # only the budget may be cleared with null
        setattr(cat, k, v)
    _commit(db, NAME_TAKEN, cat)
    return cat


@router.delete("/categories/{id}", status_code=204, dependencies=Unlocked)
def delete_category(id: uuid.UUID, db: DB, user: CurrentUser):
    cat = _owned(db, Category, id, user)
    if db.scalar(select(Expense.id).where(Expense.category_id == id).limit(1)):
        raise HTTPException(409, CATEGORY_IN_USE)
    db.delete(cat)
    _commit(db, CATEGORY_IN_USE)


# ---- expenses ----

@router.get("/expenses", response_model=list[s.ExpenseOut])
def list_expenses(start: date, end: date, db: DB, user: CurrentUser):
    """All expenses in [start, end], newest first. Category/method/search filters run client-side."""
    if start > end:
        raise HTTPException(422, "start must be on or before end")
    # ponytail: unpaginated range fetch; fine for personal volumes, paginate if ranges reach ~10k rows
    q = select(Expense).where(Expense.user_id == user.id, Expense.spent_on.between(start, end))
    return db.scalars(q.order_by(Expense.spent_on.desc(), Expense.created_at.desc())).all()


@router.get("/expenses/summary", response_model=s.Summary)
def summary(month: s.Month, db: DB, user: CurrentUser):
    return monthly_summary(db, user.id, month)


@router.post("/expenses", response_model=s.ExpenseOut, status_code=201)
def create_expense(body: s.ExpenseIn, db: DB, user: CurrentUser):
    _owned(db, Category, body.category_id, user)
    exp = Expense(user_id=user.id, **body.model_dump())
    db.add(exp)
    db.commit()
    db.refresh(exp)
    return exp


@router.patch("/expenses/{id}", response_model=s.ExpenseOut)
def update_expense(id: uuid.UUID, body: s.ExpensePatch, db: DB, user: CurrentUser):
    exp = _owned(db, Expense, id, user)
    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    if "category_id" in changes:
        _owned(db, Category, changes["category_id"], user)
    for k, v in changes.items():
        setattr(exp, k, v)
    db.commit()
    db.refresh(exp)
    return exp


@router.delete("/expenses/{id}", status_code=204)
def delete_expense(id: uuid.UUID, db: DB, user: CurrentUser):
    db.delete(_owned(db, Expense, id, user))
    db.commit()
