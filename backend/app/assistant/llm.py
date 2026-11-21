"""Groq call: classify the user's message as log / query / chat and extract structured data.

The model never computes money: for questions it returns a query spec and the app runs it in SQL.
Everything it returns is untrusted and validated by the caller.
"""
from datetime import date, timedelta
from decimal import Decimal
from typing import Literal

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, Field

from app.config import settings
from app.expenses.schemas import PaymentMethod

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
METHODS = ["upi", "card", "cash", "bank", "other"]
GROUPS = ["none", "category", "payment_method", "month", "day"]


class Extracted(BaseModel):
    amount: Decimal
    category: str
    spent_on: date
    payment_method: PaymentMethod
    note: str = ""


class QuerySpec(BaseModel):
    start: str  # YYYY-MM-DD, parsed by the caller (blank for non-queries)
    end: str
    categories: list[str] = []
    payment_methods: list[PaymentMethod] = []
    search: str = ""
    group_by: Literal["none", "category", "payment_method", "month", "day"] = "none"
    label: str = ""


class Extraction(BaseModel):
    intent: Literal["log", "query", "chat"]
    expenses: list[Extracted] = Field(default=[], max_length=20)
    query: QuerySpec | None = None
    reply: str


def _schema(categories: list[str]) -> dict:
    def obj(props: dict) -> dict:  # strict mode: every property required, nothing extra
        return {"type": "object", "properties": props, "required": list(props), "additionalProperties": False}

    category = {"type": "string", "enum": categories}
    method = {"type": "string", "enum": METHODS}
    return obj({
        "intent": {"type": "string", "enum": ["log", "query", "chat"]},
        "expenses": {"type": "array", "items": obj({
            "amount": {"type": "number"},
            "category": category,
            "spent_on": {"type": "string", "description": "YYYY-MM-DD"},
            "payment_method": method,
            "note": {"type": "string"},
        })},
        "query": obj({
            "start": {"type": "string", "description": "YYYY-MM-DD, inclusive"},
            "end": {"type": "string", "description": "YYYY-MM-DD, inclusive"},
            "categories": {"type": "array", "items": category},
            "payment_methods": {"type": "array", "items": method},
            "search": {"type": "string"},
            "group_by": {"type": "string", "enum": GROUPS},
            "label": {"type": "string"},
        }),
        "reply": {"type": "string"},
    })


def _periods(today: date) -> str:
    """Common ranges precomputed: models are unreliable at weekday and month arithmetic."""
    week = today - timedelta(days=today.weekday())  # Monday
    month = today.replace(day=1)
    last_month_end = month - timedelta(days=1)
    return (
        f"yesterday = {today - timedelta(days=1)}; this week = {week} to {today}; "
        f"last week = {week - timedelta(days=7)} to {week - timedelta(days=1)}; this month = {month} to {today}; "
        f"last month = {last_month_end.replace(day=1)} to {last_month_end}; this year = {today.replace(month=1, day=1)} to {today}"
    )


def _prompt(categories: list[str], currency: str, today: date) -> str:
    return f"""You are the assistant inside Mirrorly, a personal expense tracker.
Decide what the user's LAST message wants:
- intent "log": they spent money. Fill expenses.
- intent "query": they ask about their spending. Fill query; the app computes the exact numbers.
- intent "chat": anything else. Reply briefly that you can log expenses and answer questions about spending.

Today is {today:%A, %Y-%m-%d}. Amounts are in {currency}.
Categories: {", ".join(categories)}
Payment methods: upi (also GPay, PhonePe, Paytm), card (credit/debit), cash, bank (transfer, net banking), other.

Logging:
- One entry per purchase: "soap 20 and milk 30" is two expenses.
- category: the closest fit from the list. note: what was bought, short and capitalized, e.g. "Soap".
  Household and personal-care items (soap, shampoo, detergent) go under Groceries when that category exists.
- spent_on: resolve relative dates ("yesterday", "last Friday") from today; use today if none is given.
- payment_method: upi if not mentioned.
- If an amount is missing or unclear, log nothing (intent "chat") and ask for it.
- Earlier messages are context only (e.g. the user answering your question). Never re-log items shown as logged.

Questions:
- start/end: inclusive dates. Use these exact ranges: {_periods(today)}.
  A month name = that whole month (the most recent one). No period mentioned = this month.
- categories: the categories asked about ([] = all). search: a specific item to find in notes, e.g. "coffee"; else "".
- payment_methods: only when asked (e.g. "by card"); else [].
- group_by: "category" for "what did I spend most on" or a breakdown, "payment_method" for how they paid,
  "month" or "day" for trends over time; else "none".
- label: short scope, e.g. "Food this month", "Coffee in October", "Last week".
- A follow-up like "and last month?" keeps the previous question's scope with the new period.

Always:
- You have no tools: never call a tool or function. Answer only with the JSON object.
- reply: one short friendly sentence with no amounts or totals; the app shows exact figures.
- Unused parts stay empty: expenses is [] unless logging; unless querying, query is
  {{"start": "", "end": "", "categories": [], "payment_methods": [], "search": "", "group_by": "none", "label": ""}}."""


RETRY_TEMPERATURES = (0, 0.3, 0.6)  # first try deterministic; vary sampling on retries


def _misfire(r: httpx.Response) -> bool:
    """Random model misfires Groq rejects with a 400: gpt-oss sometimes emits a tool call although no tools
    are offered ("Tool choice is none, but model called a tool"), or JSON that fails Groq's schema check
    (Groq validates after generation; it doesn't constrain decoding). The same request usually works next time."""
    if r.status_code != 400:
        return False
    try:
        err = r.json()["error"]
    except (ValueError, KeyError, TypeError):
        return False
    return err.get("code") in ("tool_use_failed", "json_validate_failed") or "called a tool" in str(err.get("message"))


def ask_llm(messages: list[dict], categories: list[str], currency: str, today: date) -> Extraction:
    body = {
        "model": settings.groq_model,
        "messages": [{"role": "system", "content": _prompt(categories, currency, today)}, *messages],
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": "mirrorly_assistant", "strict": True, "schema": _schema(categories)},
        },
    }
    for temperature in RETRY_TEMPERATURES:
        try:
            r = httpx.post(
                GROQ_URL,
                headers={"Authorization": f"Bearer {settings.groq_api_key}"},
                json={**body, "temperature": temperature},
                timeout=30,
            )
        except httpx.HTTPError:
            raise HTTPException(502, "Couldn't reach Groq. Check your internet connection.")
        if not _misfire(r):
            break
    else:
        raise HTTPException(502, "The assistant tripped over that one. Please send it again.")
    if r.status_code == 429:  # free tier: ~8k tokens/min, roughly 5 messages a minute
        raise HTTPException(503, "The assistant is busy (Groq rate limit). Try again in a few seconds.")
    if r.status_code != 200:
        try:
            msg = r.json()["error"]["message"]
        except (ValueError, KeyError, TypeError):
            msg = r.text[:200]
        # never 401 here: the frontend treats 401 as "logged out"
        raise HTTPException(502, f"Groq error ({r.status_code}): {msg}")
    try:
        return Extraction.model_validate_json(r.json()["choices"][0]["message"]["content"])
    except (ValueError, KeyError, IndexError, TypeError):  # ValidationError is a ValueError
        raise HTTPException(502, "The assistant's answer couldn't be read. Try rephrasing.")
