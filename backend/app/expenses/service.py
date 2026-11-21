import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.expenses.models import Category, Expense
from app.expenses.schemas import CategorySpend, DaySpend, Summary

# Colors: CVD-validated categorical order (dataviz reference slots 1-7); "Other" is the neutral fold gray.
DEFAULT_CATEGORIES = [
    ("Food", "#2a78d6"), ("Groceries", "#eb6834"), ("Transport", "#1baf7a"), ("Shopping", "#eda100"),
    ("Bills", "#e87ba4"), ("Health", "#008300"), ("Entertainment", "#6250d6"), ("Other", "#898781"),
]


def seed_default_categories(db: Session, user_id: uuid.UUID) -> None:
    db.add_all(Category(user_id=user_id, name=n, color=c) for n, c in DEFAULT_CATEGORIES)


def month_range(month: str) -> tuple[date, date]:
    """'2026-11' -> (2026-11-01, 2026-12-01), end exclusive."""
    y, m = map(int, month.split("-"))
    return date(y, m, 1), date(y + m // 12, m % 12 + 1, 1)


def monthly_summary(db: Session, user_id: uuid.UUID, month: str) -> Summary:
    start, end = month_range(month)
    in_month = and_(Expense.user_id == user_id, Expense.spent_on >= start, Expense.spent_on < end)

    spent = func.coalesce(func.sum(Expense.amount), 0)
    cat_rows = db.execute(
        select(Category.id, Category.name, Category.color, Category.monthly_budget, spent.label("spent"))
        .outerjoin(Expense, and_(Expense.category_id == Category.id, in_month))
        .where(Category.user_id == user_id)
        .group_by(Category.id)
        # keep categories that have spend or a budget, so a 0-of-limit bar still shows
        .having(or_(func.count(Expense.id) > 0, Category.monthly_budget.is_not(None)))
        .order_by(spent.desc(), Category.name)
    ).all()
    day_rows = db.execute(
        select(Expense.spent_on, func.sum(Expense.amount))
        .where(in_month)
        .group_by(Expense.spent_on)
        .order_by(Expense.spent_on)
    ).all()

    by_category = [
        CategorySpend(category_id=r.id, name=r.name, color=r.color, spent=r.spent, budget=r.monthly_budget)
        for r in cat_rows
    ]
    return Summary(
        month=month,
        total=sum((c.spent for c in by_category), Decimal("0")),
        by_category=by_category,
        by_day=[DaySpend(date=d, spent=s) for d, s in day_rows],
    )


if __name__ == "__main__":
    assert month_range("2026-11") == (date(2026, 11, 1), date(2026, 12, 1))
    assert month_range("2026-12") == (date(2026, 12, 1), date(2027, 1, 1))
    assert month_range("2026-01") == (date(2026, 1, 1), date(2026, 2, 1))
    print("ok")
