"""Home chat: log expenses from natural language and answer spending questions. History is stored per user."""
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal, InvalidOperation
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import delete, func, select

from app.assistant import llm
from app.assistant.models import ChatMessage
from app.auth.models import User
from app.auth.security import DB, CurrentUser
from app.config import settings
from app.expenses.models import Category, Expense
from app.expenses.schemas import ExpenseIn

router = APIRouter(prefix="/assistant", tags=["assistant"])

HISTORY = 8  # past messages the model sees
SHOWN = 100  # ponytail: newest 100 messages only; add a `before` cursor if older history must scroll in

# The reply when the assistant won't help: fixed text, so nothing the model writes for these ever reaches the user
# (it can't answer "which AI are you?" or claim "done, everything deleted").
REFUSALS = {
    "off_topic": "I'm Mirrorly's assistant, so I can only help with your expenses: tell me what you spent "
                 "(\"Coffee 80\") or ask about your spending (\"How much on food this month?\").",
    "unsafe": "I can't do that. I can only add expenses and answer questions about them; I never delete or change "
              "your data in bulk. To remove an expense, tap it in Expenses > Transactions.",
}


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    today: date  # the client's local date, so "yesterday" resolves in the user's timezone


class Logged(BaseModel):
    """Snapshot of an expense (kept in the chat even if the expense is later deleted)."""
    id: uuid.UUID
    amount: Decimal
    note: str
    category_id: uuid.UUID
    spent_on: date
    payment_method: str


class LoggedOut(Logged):
    removed: bool


class Group(BaseModel):
    key: str  # category id, payment method, YYYY-MM or YYYY-MM-DD
    name: str
    amount: Decimal


class Answer(BaseModel):
    """Figures for a spending question, computed in SQL (never by the model)."""
    label: str
    start: date
    end: date
    total: Decimal
    count: int
    group_by: str
    groups: list[Group] = []
    largest: Logged | None = None
    budget: Decimal | None = None  # question about one budgeted category: its limit x months in range


class MessageOut(BaseModel):
    id: int
    role: Literal["user", "assistant"]
    content: str
    logged: list[LoggedOut] = []
    answer: Answer | None = None
    age: int  # seconds since stored, by the server clock (drives the 1-minute undo window; immune to client clock skew)


def _alive(db, user: User, msgs: list[ChatMessage]) -> set[str]:
    """Ids of chat-logged expenses that still exist; undone or deleted ones show as removed."""
    ids = [uuid.UUID(x["id"]) for m in msgs for x in (m.data or {}).get("logged", [])]
    if not ids:
        return set()
    return {str(i) for i in db.scalars(select(Expense.id).where(Expense.user_id == user.id, Expense.id.in_(ids)))}


def _out(m: ChatMessage, alive: set[str]) -> MessageOut:
    d = m.data or {}
    return MessageOut(
        id=m.id, role=m.role, content=m.content, answer=d.get("answer"),
        logged=[LoggedOut(**x, removed=x["id"] not in alive) for x in d.get("logged", [])],
        age=max(0, int((datetime.now(UTC) - m.created_at).total_seconds())),
    )


def _for_model(m: ChatMessage, alive: set[str]) -> dict:
    """A past turn as the model sees it: what was logged or answered is spelled out."""
    d = m.data or {}
    text = m.content
    if kept := [x for x in d.get("logged", []) if x["id"] in alive]:
        text += "\n(Logged: " + "; ".join(f"{x['note'] or 'item'} {x['amount']} on {x['spent_on']}" for x in kept) + ")"
    if a := d.get("answer"):
        text += f"\n(Answer shown: {a['label']}: total {a['total']}, {a['count']} expenses)"
    return {"role": m.role, "content": text}


def run_query(db, user: User, q: llm.QuerySpec, cats: dict[str, Category]) -> Answer:
    try:
        start, end = sorted((date.fromisoformat(q.start), date.fromisoformat(q.end)))
    except ValueError:
        raise HTTPException(502, "The assistant didn't give a clear date range. Try rephrasing.")
    picked = [cats[n.lower()] for n in q.categories if n.lower() in cats]
    search = q.search.strip()
    where = [Expense.user_id == user.id, Expense.spent_on.between(start, end)]
    if q.categories:  # unknown names match nothing rather than silently meaning "everything"
        where.append(Expense.category_id.in_([c.id for c in picked]))
    if q.payment_methods:
        where.append(Expense.payment_method.in_(q.payment_methods))
    if search:
        where.append(Expense.note.icontains(search, autoescape=True))

    total, count = db.execute(select(func.coalesce(func.sum(Expense.amount), 0), func.count()).where(*where)).one()
    groups, largest = [], None
    if count and q.group_by != "none":
        key = {
            "category": Expense.category_id,
            "payment_method": Expense.payment_method,
            "month": func.to_char(Expense.spent_on, "YYYY-MM"),
            "day": func.to_char(Expense.spent_on, "YYYY-MM-DD"),
        }[q.group_by]
        spent = func.sum(Expense.amount)
        timeline = q.group_by in ("month", "day")
        rows = db.execute(
            select(key, spent).where(*where).group_by(key).order_by(key if timeline else spent.desc()).limit(31 if timeline else 8)
        ).all()
        names = {str(c.id): c.name for c in cats.values()}
        groups = [Group(key=str(k), name=names.get(str(k), str(k)), amount=v) for k, v in rows]
    elif count:
        top = db.scalars(select(Expense).where(*where).order_by(Expense.amount.desc()).limit(1)).first()
        largest = Logged.model_validate(top, from_attributes=True)

    budget = None
    if len(picked) == 1 and picked[0].monthly_budget is not None and not search and not q.payment_methods:
        months = (end.year - start.year) * 12 + end.month - start.month + 1
        budget = picked[0].monthly_budget * months
    return Answer(label=q.label.strip() or "Your spending", start=start, end=end, total=total, count=count,
                  group_by=q.group_by, groups=groups, largest=largest, budget=budget)


@router.get("/messages", response_model=list[MessageOut])
def messages(db: DB, user: CurrentUser):
    rows = db.scalars(
        select(ChatMessage).where(ChatMessage.user_id == user.id).order_by(ChatMessage.id.desc()).limit(SHOWN)
    ).all()[::-1]
    alive = _alive(db, user, rows)
    return [_out(m, alive) for m in rows]


@router.delete("/messages", status_code=204)
def clear_messages(db: DB, user: CurrentUser):
    db.execute(delete(ChatMessage).where(ChatMessage.user_id == user.id))
    db.commit()


@router.post("/chat", response_model=list[MessageOut])
def chat(body: ChatIn, db: DB, user: CurrentUser):
    """Send one message. Returns the stored question and the assistant's stored reply."""
    if not settings.groq_api_key:
        raise HTTPException(503, "The assistant isn't set up yet: add GROQ_API_KEY to backend/.env and restart the backend.")
    cats = {c.name.lower(): c for c in db.scalars(select(Category).where(Category.user_id == user.id))}
    if not cats:
        raise HTTPException(409, "Create a category first")

    refused, result = None, None
    if llm.looks_like_command(body.message):
        refused = "unsafe"  # SQL / shell shaped: never sent to the model
    else:
        past = db.scalars(
            select(ChatMessage).where(ChatMessage.user_id == user.id).order_by(ChatMessage.id.desc()).limit(HISTORY)
        ).all()[::-1]
        past = [m for m in past if not (m.data or {}).get("refused")]  # refused turns (and any injection in them) stay out of context
        alive = _alive(db, user, past)
        history = [_for_model(m, alive) for m in past] + [{"role": "user", "content": body.message}]
        result = llm.ask_llm(history, [c.name for c in cats.values()], user.currency, body.today)
        refused = result.intent if result.intent in REFUSALS else None

    data, created = None, []
    if refused:
        data = {"refused": refused}  # whatever the model put in expenses/query is ignored
    elif result.intent == "log" and result.expenses:
        try:
            items = [
                ExpenseIn(
                    amount=e.amount.quantize(Decimal("0.01")),
                    spent_on=e.spent_on,
                    category_id=(cats.get(e.category.strip().lower()) or cats["other"]).id,
                    payment_method=e.payment_method,
                    note=e.note.strip()[:500],
                )
                for e in result.expenses
            ]
        except (ValidationError, KeyError, InvalidOperation):
            raise HTTPException(502, "The assistant proposed an invalid expense. Try rephrasing.")
        created = [Expense(user_id=user.id, **i.model_dump()) for i in items]
        db.add_all(created)
        db.flush()  # assigns ids for the snapshots
        data = {"logged": [Logged.model_validate(e, from_attributes=True).model_dump(mode="json") for e in created]}
    elif result.intent == "query" and result.query:
        data = {"answer": run_query(db, user, result.query, cats).model_dump(mode="json")}

    asked = ChatMessage(user_id=user.id, role="user", content=body.message, data={"refused": refused} if refused else None)
    db.add(asked)
    db.flush()  # the question gets the lower id
    text = REFUSALS[refused] if refused else result.reply.strip()[:1000] or "Done."
    reply = ChatMessage(user_id=user.id, role="assistant", content=text, data=data)
    db.add(reply)
    db.commit()
    return [_out(asked, set()), _out(reply, {str(e.id) for e in created})]
