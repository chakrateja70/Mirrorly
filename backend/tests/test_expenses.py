"""End-to-end API test against a real Postgres (Neon `test` branch or local).

Runs `alembic downgrade base` + `upgrade head` on TEST_DATABASE_URL first: it WIPES that database.
"""
import os
from urllib.parse import urlsplit

import pytest
from dotenv import load_dotenv

load_dotenv()
if not os.environ.get("TEST_DATABASE_URL"):
    pytest.skip("TEST_DATABASE_URL not set", allow_module_level=True)


def _db_target(url: str):  # host/port/db name, ignoring credentials and query params
    u = urlsplit(url)
    return u.hostname, u.port, u.path


if _db_target(os.environ["TEST_DATABASE_URL"]) == _db_target(os.environ.get("DATABASE_URL", "")):
    pytest.exit("TEST_DATABASE_URL points at the same database as DATABASE_URL; refusing to wipe it", returncode=1)
os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]  # before app imports read settings

import json  # noqa: E402

import httpx  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.assistant.llm as llm  # noqa: E402
from app.config import settings  # noqa: E402
from app.main import app  # noqa: E402

NOV = {"start": "2026-11-01", "end": "2026-11-30"}


@pytest.fixture(scope="module", autouse=True)
def fresh_schema():
    cfg = Config("alembic.ini")
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")


def client_for(email: str, unlock: bool = True) -> TestClient:
    c = TestClient(app, base_url="https://testserver")  # https so the Secure cookie is sent back
    r = c.post("/api/auth/register", json={"email": email, "password": "password123", "name": "T"})
    assert r.status_code == 201, r.text
    if unlock:  # category/budget changes need the PIN
        assert c.post("/api/categories/unlock", json={"pin": settings.budget_pin}).status_code == 204
    return c


def cat_id(c: TestClient, name: str) -> str:
    return next(x["id"] for x in c.get("/api/categories").json() if x["name"] == name)


def test_expense_tracker_flow():
    a = client_for("A@example.com")

    # auth: cookie session works, email normalized, duplicate rejected, login works, logout clears
    me = a.get("/api/auth/me")
    assert me.json()["email"] == "a@example.com"
    assert me.headers["cache-control"] == "no-store"  # personal data must never be cached by a CDN/proxy
    assert a.post("/api/auth/register", json={"email": "a@example.com", "password": "password123", "name": "x"}).status_code == 409
    anon = TestClient(app, base_url="https://testserver")
    assert anon.get("/api/categories").status_code == 401
    assert anon.post("/api/auth/login", json={"email": "a@example.com", "password": "wrong-pass"}).status_code == 401
    assert anon.post("/api/auth/login", json={"email": "a@example.com", "password": "password123"}).status_code == 200
    assert anon.get("/api/auth/me").status_code == 200
    anon.post("/api/auth/logout")
    assert anon.get("/api/auth/me").status_code == 401

    # default categories seeded
    assert len(a.get("/api/categories").json()) == 8
    food, bills = cat_id(a, "Food"), cat_id(a, "Bills")

    # budgets: one with spend, one budget-only (must still appear in summary with spent 0)
    assert a.patch(f"/api/categories/{food}", json={"monthly_budget": "1000"}).json()["monthly_budget"] == "1000.00"
    a.patch(f"/api/categories/{bills}", json={"monthly_budget": "5000"})

    # expenses in Nov and one in Dec (must not leak into Nov)
    for amount, day in [("100.10", "2026-11-01"), ("200.20", "2026-11-01"), ("50.00", "2026-11-15")]:
        r = a.post("/api/expenses", json={"amount": amount, "spent_on": day, "category_id": food, "note": "x"})
        assert r.status_code == 201, r.text
    a.post("/api/expenses", json={"amount": "999", "spent_on": "2026-12-01", "category_id": food})

    nov = a.get("/api/expenses", params=NOV).json()
    assert [e["spent_on"] for e in nov] == ["2026-11-15", "2026-11-01", "2026-11-01"]

    s = a.get("/api/expenses/summary", params={"month": "2026-11"}).json()
    assert s["total"] == "350.30"
    by_cat = {c["name"]: (c["spent"], c["budget"]) for c in s["by_category"]}
    assert by_cat == {"Food": ("350.30", "1000.00"), "Bills": ("0", "5000.00")}
    assert s["by_day"] == [{"date": "2026-11-01", "spent": "300.30"}, {"date": "2026-11-15", "spent": "50.00"}]

    # edit + delete
    eid = nov[0]["id"]
    assert a.patch(f"/api/expenses/{eid}", json={"amount": "75.5", "category_id": bills}).json()["amount"] == "75.50"
    assert a.get("/api/expenses/summary", params={"month": "2026-11"}).json()["total"] == "375.80"

    # validation
    assert a.post("/api/expenses", json={"amount": "0", "spent_on": "2026-11-01", "category_id": food}).status_code == 422
    assert a.post("/api/expenses", json={"amount": "1.001", "spent_on": "2026-11-01", "category_id": food}).status_code == 422
    assert a.get("/api/expenses", params={"start": "2026-11-30", "end": "2026-11-01"}).status_code == 422
    assert a.get("/api/expenses/summary", params={"month": "2026-13"}).status_code == 422
    assert a.post("/api/categories", json={"name": "Food"}).status_code == 409

    # category in use cannot be deleted; unused can
    assert a.delete(f"/api/categories/{food}").status_code == 409
    assert a.delete(f"/api/categories/{cat_id(a, 'Health')}").status_code == 204

    # isolation: user B cannot see or touch A's data
    b = client_for("b@example.com")
    assert b.get("/api/expenses", params=NOV).json() == []
    assert b.get("/api/expenses/summary", params={"month": "2026-11"}).json()["total"] == "0"
    assert b.patch(f"/api/expenses/{eid}", json={"amount": "1"}).status_code == 404
    assert b.delete(f"/api/expenses/{eid}").status_code == 404
    assert b.patch(f"/api/categories/{food}", json={"name": "hacked"}).status_code == 404
    assert b.post("/api/expenses", json={"amount": "1", "spent_on": "2026-11-01", "category_id": food}).status_code == 404
    assert len(b.get("/api/categories").json()) == 8  # B got its own "Food" etc: names unique per user only

    assert a.delete(f"/api/expenses/{eid}").status_code == 204
    assert a.delete(f"/api/expenses/{eid}").status_code == 404


BLANK_QUERY = {"start": "", "end": "", "categories": [], "payment_methods": [], "search": "", "group_by": "none", "label": ""}


def fake_groq(answer: dict | None = None, status: int = 200):
    """Stand-in for httpx.post to Groq: records request bodies, returns `answer` as the model's JSON."""
    sent = []

    def post(url, **kw):
        sent.append(kw["json"])
        if status != 200:
            return httpx.Response(status, json={"error": {"message": "Invalid API Key"}})
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(answer)}}]})
    return post, sent


def model_says(monkeypatch, intent, reply, expenses=(), **query):
    """Make the fake model answer with this intent; returns the list of request bodies it receives."""
    post, sent = fake_groq({"intent": intent, "reply": reply, "expenses": list(expenses), "query": {**BLANK_QUERY, **query}})
    monkeypatch.setattr(llm.httpx, "post", post)
    return sent


def test_assistant_chat(monkeypatch):
    c = client_for("chat@example.com")

    def ask(text):
        return c.post("/api/assistant/chat", json={"message": text, "today": "2026-11-21"})

    def history():
        return c.get("/api/assistant/messages").json()

    # not configured: clear 503
    monkeypatch.setattr(settings, "groq_api_key", "")
    assert ask("soap 20").status_code == 503
    monkeypatch.setattr(settings, "groq_api_key", "test-key")

    # log two purchases: case-insensitive category match, unknown category -> Other, amounts normalized
    sent = model_says(monkeypatch, "log", "Logged both!", [
        {"amount": 20, "category": "groceries", "spent_on": "2026-11-21", "payment_method": "upi", "note": "Soap"},
        {"amount": 30.5, "category": "Toiletries", "spent_on": "2026-11-20", "payment_method": "cash", "note": "Shampoo"},
    ])
    r = ask("I purchased a soap of cost 20 rupees and shampoo for 30.5 in cash yesterday")
    assert r.status_code == 200, r.text
    question, reply = r.json()
    assert question["role"] == "user" and question["content"].startswith("I purchased a soap")
    assert reply["content"] == "Logged both!"
    assert 0 <= reply["age"] < 5  # seconds since stored: drives the 1-minute undo window
    assert [(e["amount"], e["note"], e["category_id"], e["payment_method"], e["spent_on"], e["removed"]) for e in reply["logged"]] == [
        ("20.00", "Soap", cat_id(c, "Groceries"), "upi", "2026-11-21", False),
        ("30.50", "Shampoo", cat_id(c, "Other"), "cash", "2026-11-20", False),
    ]
    schema = sent[-1]["response_format"]["json_schema"]["schema"]["properties"]
    assert set(schema["expenses"]["items"]["properties"]["category"]["enum"]) == {
        "Food", "Groceries", "Transport", "Shopping", "Bills", "Health", "Entertainment", "Other"}
    assert "Saturday, 2026-11-21" in sent[-1]["messages"][0]["content"]
    assert len(c.get("/api/expenses", params=NOV).json()) == 2

    # history is stored; undoing an expense marks it removed in the chat
    assert [m["role"] for m in history()] == ["user", "assistant"]
    assert c.delete(f"/api/expenses/{reply['logged'][1]['id']}").status_code == 204
    assert [e["removed"] for e in history()[1]["logged"]] == [False, True]

    # a spending question: the model only gives the scope, the figures come from SQL
    c.patch(f"/api/categories/{cat_id(c, 'Groceries')}", json={"monthly_budget": "4000"})
    sent = model_says(monkeypatch, "query", "Here's your grocery spending.",
                      start="2026-11-01", end="2026-11-21", categories=["Groceries"], label="Groceries this month")
    r = ask("how much did I spend on groceries?")
    assert r.status_code == 200, r.text
    a = r.json()[1]["answer"]
    assert (a["label"], a["total"], a["count"], a["budget"], a["largest"]["note"]) == ("Groceries this month", "20.00", 1, "4000.00", "Soap")
    context = sent[-1]["messages"]  # system, past turns..., this question
    assert context[-1] == {"role": "user", "content": "how much did I spend on groceries?"}
    assert "(Logged: Soap 20.00 on 2026-11-21)" in context[-2]["content"]
    assert "Shampoo" not in context[-2]["content"]  # undone items are not presented as logged

    # breakdown by category, case-insensitive item search, and an unknown category that must match nothing
    c.post("/api/expenses", json={"amount": "120", "spent_on": "2026-11-19", "category_id": cat_id(c, "Food"), "note": "Coffee"})
    c.post("/api/expenses", json={"amount": "80", "spent_on": "2026-10-05", "category_id": cat_id(c, "Food"), "note": "coffee beans"})
    model_says(monkeypatch, "query", "Breakdown:", start="2026-11-01", end="2026-11-30", group_by="category", label="This month")
    groups = ask("what did I spend most on?").json()[1]["answer"]["groups"]
    assert [(g["name"], g["amount"]) for g in groups] == [("Food", "120.00"), ("Groceries", "20.00")]
    model_says(monkeypatch, "query", "Coffee:", start="2026-01-01", end="2026-11-21", search="COFFEE", label="Coffee this year")
    assert ask("coffee this year?").json()[1]["answer"]["total"] == "200.00"
    model_says(monkeypatch, "query", "x", start="2026-11-01", end="2026-11-30", categories=["Nope"], label="x")
    assert ask("nope?").json()[1]["answer"]["count"] == 0

    # small talk: stored, no data
    model_says(monkeypatch, "chat", "I can log expenses and answer questions about your spending.")
    r = ask("hello").json()[1]
    assert r["logged"] == [] and r["answer"] is None

    # rejected proposals and Groq failures store nothing
    before = len(history())
    model_says(monkeypatch, "log", "x", [{"amount": 0, "category": "Food", "spent_on": "2026-11-21", "payment_method": "upi", "note": "Free"}])
    assert ask("got a free sample").status_code == 502
    model_says(monkeypatch, "query", "x", start="soon", end="later", label="x")
    assert ask("how much recently?").status_code == 502
    post, _ = fake_groq(status=401)
    monkeypatch.setattr(llm.httpx, "post", post)
    r = ask("soap 20")
    assert r.status_code == 502  # never 401: the frontend would treat that as "logged out"
    assert "Invalid API Key" in r.json()["detail"]
    assert len(history()) == before

    # history is private to each user, and can be cleared
    assert client_for("other@example.com").get("/api/assistant/messages").json() == []
    assert c.delete("/api/assistant/messages").status_code == 204
    assert history() == []


def scripted_groq(*statuses, answer=None):
    """Fake Groq answering with these HTTP statuses in order (400 = the gpt-oss tool-call misfire)."""
    temperatures = []

    def post(url, **kw):
        temperatures.append(kw["json"]["temperature"])
        if statuses[min(len(temperatures), len(statuses)) - 1] == 400:
            return httpx.Response(400, json={"error": {
                "message": "Tool choice is none, but model called a tool", "type": "invalid_request_error", "code": "tool_use_failed"}})
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(answer)}}]})
    return post, temperatures


def test_assistant_retries_model_misfires(monkeypatch):
    c = client_for("retry@example.com")
    monkeypatch.setattr(settings, "groq_api_key", "test-key")
    bag = {"intent": "log", "reply": "Logged!", "query": BLANK_QUERY, "expenses": [
        {"amount": 2500, "category": "Shopping", "spent_on": "2026-11-21", "payment_method": "upi", "note": "Bag"}]}

    def ask():
        return c.post("/api/assistant/chat", json={"message": "i purchased a bag 2500 cost", "today": "2026-11-21"})

    # one misfire, then success: retried with different sampling, logged exactly once
    post, temperatures = scripted_groq(400, 200, answer=bag)
    monkeypatch.setattr(llm.httpx, "post", post)
    r = ask()
    assert r.status_code == 200, r.text
    assert temperatures == [0, 0.3]
    assert [e["note"] for e in r.json()[1]["logged"]] == ["Bag"]

    # misfires every time: a friendly 502 after three attempts, nothing stored
    post, temperatures = scripted_groq(400, 400, 400)
    monkeypatch.setattr(llm.httpx, "post", post)
    r = ask()
    assert r.status_code == 502
    assert "send it again" in r.json()["detail"]
    assert len(temperatures) == 3
    assert len(c.get("/api/assistant/messages").json()) == 2
    assert len(c.get("/api/expenses", params=NOV).json()) == 1


def test_category_pin(monkeypatch):
    c = client_for("pin@example.com", unlock=False)
    food = cat_id(c, "Food")
    pin = settings.budget_pin

    # locked: listing works, every change is refused with 403 (never 401, which would log the user out)
    assert len(c.get("/api/categories").json()) == 8
    assert c.patch(f"/api/categories/{food}", json={"monthly_budget": "100"}).status_code == 403
    assert c.post("/api/categories", json={"name": "Pets"}).status_code == 403
    assert c.delete(f"/api/categories/{food}").status_code == 403

    # wrong PIN counts down; the right one unlocks changes
    r = c.post("/api/categories/unlock", json={"pin": pin + "9"})
    assert r.status_code == 403 and "4 tries left" in r.json()["detail"]
    assert c.post("/api/categories/unlock", json={"pin": pin}).status_code == 204
    assert c.patch(f"/api/categories/{food}", json={"monthly_budget": "100"}).status_code == 200
    assert c.post("/api/categories", json={"name": "Pets"}).status_code == 201

    # an unlock cookie is bound to its user: transplanted into another account it is refused
    unlock_cookie = next(ck for ck in c.cookies.jar if ck.name == "mirrorly_unlock")
    same_user = TestClient(app, base_url="https://testserver")  # control: proves the transplant is actually sent
    same_user.post("/api/auth/login", json={"email": "pin@example.com", "password": "password123"})
    same_user.cookies.jar.set_cookie(unlock_cookie)
    assert same_user.patch(f"/api/categories/{food}", json={"monthly_budget": "200"}).status_code == 200
    other = client_for("pin-other@example.com", unlock=False)
    other.cookies.jar.set_cookie(unlock_cookie)
    assert other.patch(f"/api/categories/{cat_id(other, 'Food')}", json={"monthly_budget": "1"}).status_code == 403

    # 5 wrong tries lock it, even for the right PIN
    locked = client_for("pin-locked@example.com", unlock=False)
    for _ in range(5):
        r = locked.post("/api/categories/unlock", json={"pin": "wrong"})
    assert r.status_code == 403 and "Locked" in r.json()["detail"]
    assert locked.post("/api/categories/unlock", json={"pin": pin}).status_code == 429
