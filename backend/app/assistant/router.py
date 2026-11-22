"""Home chat: log expenses from natural language and answer spending questions. History is stored per user."""
import uuid
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal, InvalidOperation
from typing import Literal

from fastapi import APIRouter, HTTPException, UploadFile
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import delete, func, select

from app.assistant import llm
from app.assistant.models import ChatMessage
from app.auth.models import User
from app.auth.security import DB, CurrentUser
from app.config import settings
from app.expenses.models import Category, Expense
from app.expenses.schemas import ExpenseIn
from app.ious.models import Iou
from app.ious.router import IouIn, IouOut, open_ious, repay
from app.wellness.router import HealthAnswer, MealOut, add_meal, answer_stats, coach_reply, get_profile, next_stops, save_checkin

router = APIRouter(prefix="/assistant", tags=["assistant"])

HISTORY = 8  # past messages the model sees
SHOWN = 100  # ponytail: newest 100 messages only; add a `before` cursor if older history must scroll in

# The reply when the assistant won't help: fixed text, so nothing the model writes for these ever reaches the user
# (it can't answer "which AI are you?" or claim "done, everything deleted").
REFUSALS = {
    "off_topic": "I'm Mirrorly's assistant, so I can only help with your expenses and your Food & Health log: tell me "
                 "what you spent (\"Coffee 80\"), what you ate or how you slept (\"2 idli and sambar for breakfast\"), "
                 "or ask about your spending (\"How much on food this month?\").",
    "unsafe": "I can't do that. I can only add expenses and answer questions about them; I never delete or change "
              "your data in bulk. To remove an expense, tap it in Expenses > Transactions.",
}


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    today: date  # the client's local date, so "yesterday" resolves in the user's timezone
    voice: bool = False  # typed by voice (transcribed); shown with a mic on the message
    now: time | None = None  # the client's local time, for "what's next on my route?"


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


class HealthLogged(BaseModel):
    """What a Food & Health message recorded (snapshot, as it was then)."""
    day: date
    meals: list[MealOut] = []
    checkin: dict = {}  # check-in fields set: bed_time/wake_time "HH:MM", minutes and ml as numbers


class MessageOut(BaseModel):
    id: int
    role: Literal["user", "assistant"]
    content: str
    logged: list[LoggedOut] = []
    answer: Answer | None = None
    ious: list[IouOut] = []  # IOUs this reply recorded, repaid or listed (as they were then)
    health: HealthLogged | None = None  # food, sleep, screen time... this reply logged
    health_answer: HealthAnswer | None = None  # figures, next stops or suggested foods for a Food & Health question
    voice: bool = False  # the user's message was spoken
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
        id=m.id, role=m.role, content=m.content, answer=d.get("answer"), ious=d.get("ious", []), voice=d.get("voice", False),
        health=d.get("health"), health_answer=d.get("health_answer"),
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
    if ious := d.get("ious"):  # so "he returned it" knows who "he" is
        text += "\n(IOUs: " + "; ".join(f"{x['direction']} {x['person']} {x['amount']}, repaid {x['repaid']}" for x in ious) + ")"
    if h := d.get("health"):  # so "and for dinner…" doesn't re-log lunch
        facts = [f"{m['slot']} {m['text']}" for m in h["meals"]] + [f"{k} {v}" for k, v in h["checkin"].items()]
        text += f"\n(Logged health for {h['day']}: " + "; ".join(facts) + ")"
    if (q := d.get("health_answer")) and q["topic"] not in ("advice", "plan"):  # so "and last week?" keeps the topic
        text += f"\n(Answer shown: {q['label']}, {q['start']} to {q['end']})"
    return {"role": m.role, "content": text}


def _snapshots(rows: list[Iou]) -> list[dict]:
    return [IouOut.model_validate(r, from_attributes=True).model_dump(mode="json") for r in rows]


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


CHECKIN_LIMITS = {"sleep_minutes": 1440, "screen_minutes": 1440, "water_ml": 10000, "exercise_minutes": 1440}


def _log_health(db, user: User, h: llm.HealthLog, today: date) -> tuple[dict | None, str | None]:
    """Store what a Food & Health message said: check-in fields, then each meal (read by the meal model)."""
    try:
        day = date.fromisoformat(h.day) if h.day.strip() else today
        fields = {k: time.fromisoformat(v.strip()) for k in ("bed_time", "wake_time") if (v := getattr(h, k)).strip()}
        meals = [(m.slot, time.fromisoformat(m.eaten_at.strip()) if m.eaten_at.strip() else None, m.text.strip()[:300])
                 for m in h.meals if m.text.strip()]
    except ValueError:
        raise HTTPException(502, "The assistant didn't get the details right. Try rephrasing.")
    day = min(day, today)  # nothing gets logged into the future
    fields |= {k: min(v, cap) for k, cap in CHECKIN_LIMITS.items() if (v := getattr(h, k)) >= 0}
    if not fields and not meals:
        return None, "Tell me what you ate, how long you slept, or your screen time, and I'll log it in Food & Health."
    checkin = {}
    if fields:
        row = save_checkin(db, user.id, day, fields)
        checkin = {k: v.strftime("%H:%M") if isinstance(v, time) else v for k, v in fields.items()}
        if row.sleep_minutes is not None and {"bed_time", "wake_time"} & fields.keys():
            checkin["sleep_minutes"] = row.sleep_minutes
    rows = [add_meal(db, user.id, day, *m) for m in meals]
    logged = HealthLogged(day=day, meals=[MealOut.model_validate(r) for r in rows], checkin=checkin)
    return {"health": logged.model_dump(mode="json")}, None


NAMES = {"sleep": "sleep", "screen": "screen time", "water": "water", "exercise": "exercise", "energy": "energy", "meals": "meals"}


def _answer_health(db, user: User, q: llm.HealthAsk, today: date, now: time | None, history: list[dict]) -> tuple[dict | None, str | None]:
    """A Food & Health question: figures from the logs, the rest of today's route, or a coach answer."""
    p = get_profile(db, user.id)
    if not p:
        return None, "Set up Food & Health first (it takes two minutes), then I can answer from your own logs and plan."
    if q.topic == "advice":
        answer, foods = coach_reply(db, user.id, p, today, now, history)
        return {"health_answer": HealthAnswer(topic="advice", foods=foods).model_dump(mode="json")}, answer
    if q.topic == "plan":
        a = next_stops(db, user.id, today, now)
        if a is None:
            return None, "You don't have a plan for today yet. Open Food & Health and tap Make my plan."
        if not a.stops:
            return None, "That's everything on today's route. Sleep well!"
        return {"health_answer": a.model_dump(mode="json")}, None
    try:
        start, end = sorted((date.fromisoformat(q.start), date.fromisoformat(q.end)))
    except ValueError:
        start, end = today - timedelta(days=6), today
    end = min(end, today)
    start = min(max(start, end - timedelta(days=92)), end)
    a = answer_stats(db, user.id, p, q.topic, start, end, q.label.strip()[:60] or f"Your {NAMES[q.topic]}")
    if not a.values and not a.meals:
        return None, (f"I don't see any {NAMES[q.topic]} logged for that period. Log it in Food & Health, or just tell me "
                      "(\"slept 11 to 7\", \"had dosa for breakfast\").")
    return {"health_answer": a.model_dump(mode="json")}, None


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


MAX_AUDIO = 3 * 1024 * 1024  # ~3 minutes of compressed speech; the app stops recording at one minute


class Transcript(BaseModel):
    text: str


@router.post("/transcribe", response_model=Transcript)
def transcribe(audio: UploadFile, db: DB, user: CurrentUser):
    """A voice message -> text. The app then sends that text as an ordinary chat message (voice=true), so
    spoken requests go through exactly the same checks as typed ones."""
    if not settings.groq_api_key:
        raise HTTPException(503, "The assistant isn't set up yet: add GROQ_API_KEY to backend/.env and restart the backend.")
    kind = (audio.content_type or "").split(";")[0].strip()
    if not kind.startswith("audio/"):
        raise HTTPException(415, "Send an audio recording.")
    data = audio.file.read(MAX_AUDIO + 1)
    if len(data) > MAX_AUDIO:
        raise HTTPException(413, "That recording is too long. Keep voice messages under a minute.")
    cats = db.scalars(select(Category.name).where(Category.user_id == user.id)).all()
    hint = (f"Spending and money in {user.currency}. Coffee 80, lent 500 to Rahul, paid by UPI, GPay, card, cash. "
            f"Slept 7 hours, 2 idli and sambar, biryani, 5 hours screen time. Categories: {', '.join(cats)}.")
    text = llm.transcribe(data, audio.filename or "voice.webm", kind, hint)
    if not text:
        raise HTTPException(422, "I didn't catch that. Try again, a little closer to the mic.")
    return Transcript(text=text[:1000])


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

    data, created, override = None, [], None
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
    elif result.intent == "iou" and result.ious:
        try:
            items = [
                IouIn(
                    person=i.person.strip()[:100], direction=i.direction, amount=i.amount.quantize(Decimal("0.01")),
                    given_on=i.given_on, due_on=date.fromisoformat(i.due_on) if i.due_on.strip() else None,
                    note=i.note.strip()[:500],
                )
                for i in result.ious
            ]
        except (ValueError, InvalidOperation):  # pydantic's ValidationError is a ValueError
            raise HTTPException(502, "The assistant proposed an invalid IOU. Try rephrasing.")
        rows = [Iou(user_id=user.id, **i.model_dump()) for i in items]
        db.add_all(rows)
        db.flush()
        data = {"ious": _snapshots(rows)}
    elif result.intent == "repay" and result.repayments:
        rows = [iou for p in result.repayments for iou in repay(db, user.id, p.person, p.direction, p.amount)]
        db.flush()
        if rows:
            data = {"ious": _snapshots(rows)}
        else:  # say so plainly instead of letting the model claim a repayment that didn't happen
            override = f"I couldn't find an open IOU with {', '.join(sorted({p.person.strip() for p in result.repayments}))}. Check the IOUs page."
    elif result.intent == "health" and result.health:
        data, override = _log_health(db, user, result.health, body.today)
    elif result.intent == "health_ask" and result.health_ask:
        data, override = _answer_health(db, user, result.health_ask, body.today, body.now, history)
    elif result.intent == "owed":
        rows = open_ious(db, user.id)[:10]
        if rows:
            data = {"ious": _snapshots(rows)}
        else:
            override = "No open IOUs: nobody owes you anything, and you don't owe anyone."

    asked_data = ({"refused": refused} if refused else {}) | ({"voice": True} if body.voice else {})
    asked = ChatMessage(user_id=user.id, role="user", content=body.message, data=asked_data or None)
    db.add(asked)
    db.flush()  # the question gets the lower id
    text = REFUSALS[refused] if refused else override or result.reply.strip()[:1000] or "Done."
    reply = ChatMessage(user_id=user.id, role="assistant", content=text, data=data)
    db.add(reply)
    db.commit()
    return [_out(asked, set()), _out(reply, {str(e.id) for e in created})]
