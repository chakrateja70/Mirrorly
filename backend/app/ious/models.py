import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Iou(Base):
    """Money lent to or borrowed from a person. Not an expense: it never counts toward spending."""

    __tablename__ = "ious"
    __table_args__ = (
        CheckConstraint("direction IN ('lent', 'borrowed')", name="iou_direction_valid"),
        CheckConstraint("amount > 0", name="iou_amount_positive"),
        CheckConstraint("repaid >= 0 AND repaid <= amount", name="iou_repaid_within_amount"),
        CheckConstraint("due_on IS NULL OR due_on >= given_on", name="iou_due_after_given"),
        Index("ix_ious_user_id", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    person: Mapped[str] = mapped_column(String(100))
    direction: Mapped[str] = mapped_column(String(10))  # lent: they owe the user; borrowed: the user owes them
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    repaid: Mapped[Decimal] = mapped_column(Numeric(12, 2), server_default="0")  # settled once repaid == amount
    given_on: Mapped[date] = mapped_column(Date)
    due_on: Mapped[date | None] = mapped_column(Date)
    note: Mapped[str] = mapped_column(Text, server_default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
