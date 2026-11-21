from alembic import context

from app.assistant.models import ChatMessage  # noqa: F401  (register tables on Base.metadata)
from app.auth.models import User  # noqa: F401
from app.db import Base, engine
from app.expenses.models import Category, Expense  # noqa: F401

# URL comes from app settings (.env / DATABASE_URL), not alembic.ini.
with engine.connect() as connection:
    context.configure(connection=connection, target_metadata=Base.metadata)
    with context.begin_transaction():
        context.run_migrations()
