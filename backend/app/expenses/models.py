import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Category(Base):
    __tablename__ = "categories"
    __table_args__ = (UniqueConstraint("user_id", "name"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(50))
    color: Mapped[str] = mapped_column(String(7))
    # ponytail: one recurring monthly budget per category; add a budgets(category, month) table if limits must vary by month
    monthly_budget: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Expense(Base):
    __tablename__ = "expenses"
    __table_args__ = (
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint("payment_method IN ('cash', 'card', 'upi', 'bank', 'other')", name="payment_method_valid"),
        Index("ix_expenses_user_spent_on", "user_id", "spent_on"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("categories.id", ondelete="RESTRICT"))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    spent_on: Mapped[date] = mapped_column(Date)
    note: Mapped[str] = mapped_column(Text, server_default="")
    payment_method: Mapped[str] = mapped_column(String(10), server_default="upi")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
