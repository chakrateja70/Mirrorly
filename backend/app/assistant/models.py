import uuid
from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class ChatMessage(Base):
    """One turn of the Home chat. `data` holds what the assistant did:
    {"logged": [expense snapshots]} or {"answer": {...computed figures...}}."""

    __tablename__ = "chat_messages"
    __table_args__ = (
        CheckConstraint("role IN ('user', 'assistant')", name="role_valid"),
        Index("ix_chat_messages_user_id_id", "user_id", "id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)  # increasing: conversation order
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    role: Mapped[str] = mapped_column(String(10))
    content: Mapped[str] = mapped_column(Text)
    data: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
