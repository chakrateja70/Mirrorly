import uuid
from datetime import date
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

# Decimal serializes to a JSON string, so money never passes through floats.
Money = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=2)]
Color = Annotated[str, Field(pattern=r"^#[0-9a-fA-F]{6}$")]
PaymentMethod = Literal["cash", "card", "upi", "bank", "other"]
Month = Annotated[str, Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$", examples=["2026-11"])]


class PinIn(BaseModel):
    pin: str = Field(min_length=1, max_length=32)


class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    color: Color = "#6b7280"
    monthly_budget: Money | None = None


class CategoryPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=50)
    color: Color | None = None
    monthly_budget: Money | None = None  # send null explicitly to clear the budget


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    color: str
    monthly_budget: Decimal | None


class ExpenseIn(BaseModel):
    amount: Money
    spent_on: date
    category_id: uuid.UUID
    payment_method: PaymentMethod = "upi"
    note: str = Field(default="", max_length=500)


class ExpensePatch(BaseModel):
    amount: Money | None = None
    spent_on: date | None = None
    category_id: uuid.UUID | None = None
    payment_method: PaymentMethod | None = None
    note: str | None = Field(default=None, max_length=500)


class ExpenseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    amount: Decimal
    spent_on: date
    category_id: uuid.UUID
    payment_method: str
    note: str


class CategorySpend(BaseModel):
    category_id: uuid.UUID
    name: str
    color: str
    spent: Decimal
    budget: Decimal | None


class DaySpend(BaseModel):
    date: date
    spent: Decimal


class Summary(BaseModel):
    month: str
    total: Decimal
    by_category: list[CategorySpend]
    by_day: list[DaySpend]
