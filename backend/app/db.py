import re
from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

# Neon's copy-paste URL is postgresql://..., which SQLAlchemy maps to psycopg2; use the installed psycopg 3.
DB_URL = re.sub(r"^postgres(ql)?://", "postgresql+psycopg://", settings.database_url)
# pool_pre_ping: Neon suspends idle compute, so stale pooled connections are common.
engine = create_engine(DB_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Iterator[Session]:
    with SessionLocal() as db:
        yield db
