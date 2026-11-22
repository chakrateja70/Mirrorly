"""IOUs: money lent to or borrowed from people, with an optional due date. Kept apart from expenses."""
import uuid
from datetime import date
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import func, select

from app.auth.security import DB, CurrentUser
from app.expenses.schemas import Money
from app.ious.models import Iou

router = APIRouter(prefix="/ious", tags=["ious"])

Direction = Literal["lent", "borrowed"]
Repaid = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)]
DUE_BEFORE_GIVEN = "The due date can't be before the day the money was given"


class IouIn(BaseModel):
    person: str = Field(min_length=1, max_length=100)
    direction: Direction
    amount: Money
    given_on: date
    due_on: date | None = None
    note: str = Field(default="", max_length=500)

    @model_validator(mode="after")
    def _dates(self):
        if self.due_on and self.due_on < self.given_on:
            raise ValueError(DUE_BEFORE_GIVEN)
        return self


class IouPatch(BaseModel):
    person: str | None = Field(default=None, min_length=1, max_length=100)
    direction: Direction | None = None
    amount: Money | None = None
    repaid: Repaid | None = None  # paid back so far; equal to amount = settled
    given_on: date | None = None
    due_on: date | None = None  # send null explicitly to clear
    note: str | None = Field(default=None, max_length=500)


class IouOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    person: str
    direction: Direction
    amount: Decimal
    repaid: Decimal
    given_on: date
    due_on: date | None
    note: str


def _owned(db, id: uuid.UUID, user) -> Iou:
    iou = db.get(Iou, id)
    if not iou or iou.user_id != user.id:
        raise HTTPException(404, "IOU not found")
    return iou


def open_ious(db, user_id: uuid.UUID) -> list[Iou]:
    """Not yet fully repaid, soonest due first (no due date last)."""
    return db.scalars(
        select(Iou).where(Iou.user_id == user_id, Iou.repaid < Iou.amount)
        .order_by(Iou.due_on.asc().nulls_last(), Iou.given_on, Iou.created_at)
    ).all()


def repay(db, user_id: uuid.UUID, person: str, direction: str, amount: Decimal | None) -> list[Iou]:
    """Apply a repayment to this person's open IOUs, oldest first; a missing/zero amount settles them all.
    Never pays past what's owed. Returns the IOUs it changed (not committed)."""
    rows = db.scalars(
        select(Iou).where(
            Iou.user_id == user_id, Iou.direction == direction, Iou.repaid < Iou.amount,
            func.lower(Iou.person) == person.strip().lower(),
        ).order_by(Iou.given_on, Iou.created_at)
    ).all()
    left = amount if amount and amount > 0 else None  # None = everything
    touched = []
    for iou in rows:
        pay = iou.amount - iou.repaid if left is None else min(iou.amount - iou.repaid, left)
        iou.repaid += pay
        touched.append(iou)
        if left is not None:
            left -= pay
            if left <= 0:
                break
    return touched


@router.get("", response_model=list[IouOut])
def list_ious(db: DB, user: CurrentUser):
    # ponytail: unpaginated; personal IOU lists stay small
    return db.scalars(select(Iou).where(Iou.user_id == user.id).order_by(Iou.given_on.desc(), Iou.created_at.desc())).all()


@router.post("", response_model=IouOut, status_code=201)
def create_iou(body: IouIn, db: DB, user: CurrentUser):
    iou = Iou(user_id=user.id, **body.model_dump())
    db.add(iou)
    db.commit()
    db.refresh(iou)
    return iou


@router.patch("/{id}", response_model=IouOut)
def update_iou(id: uuid.UUID, body: IouPatch, db: DB, user: CurrentUser):
    iou = _owned(db, id, user)
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is None and k != "due_on":
            continue  # only the due date may be cleared with null
        setattr(iou, k, v)
    if iou.repaid > iou.amount:
        raise HTTPException(422, "Paid back can't be more than the amount")
    if iou.due_on and iou.due_on < iou.given_on:
        raise HTTPException(422, DUE_BEFORE_GIVEN)
    db.commit()
    db.refresh(iou)
    return iou


@router.delete("/{id}", status_code=204)
def delete_iou(id: uuid.UUID, db: DB, user: CurrentUser):
    db.delete(_owned(db, id, user))
    db.commit()
