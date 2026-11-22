"""Food & Health: profile, daily check-ins, meals, and the coach's targets, insights, day plan and journey.

Mounted at /wellness (/api/health is the healthcheck). Numbers and rules live in coach.py, words in ai.py.
"""
import uuid
from dataclasses import asdict
from datetime import date, time, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, model_validator
from sqlalchemy import delete, select

from app.auth.security import DB, CurrentUser
from app.config import settings
from app.wellness import ai, coach
from app.wellness.models import Meal, WellnessDay, WellnessPlan, WellnessProfile

router = APIRouter(prefix="/wellness", tags=["wellness"])

HHMM = Annotated[time, PlainSerializer(lambda t: t.strftime("%H:%M"), return_type=str, when_used="json")]  # what <input type="time"> takes
Slot = Literal["breakfast", "lunch", "snack", "dinner"]
Condition = Literal["diabetes", "high_bp", "thyroid", "pcos", "cholesterol", "acidity", "anemia", "pregnant", "breastfeeding"]
SleepIssue = Literal["falling_asleep", "waking_up", "snoring", "tired_mornings", "irregular"]
Unit = Literal["cup", "bowl", "plate", "piece", "slice", "g", "ml", "glass", "tbsp", "tsp", "serving"]
UNIT_WORDS = {"cup": "cup", "bowl": "bowl", "plate": "plate", "piece": "piece", "slice": "slice", "glass": "glass", "serving": "serving",
              "g": "g", "ml": "ml", "tbsp": "tbsp", "tsp": "tsp"}
Words = list[Annotated[str, Field(min_length=1, max_length=50)]]
HISTORY_DAYS = 30  # what the coach looks back over


class UsualMeal(BaseModel):
    time: str = Field(default="", pattern=r"^(([01]\d|2[0-3]):[0-5]\d)?$")
    food: str = Field(default="", max_length=200)


class ProfileIn(BaseModel):
    birth_year: int = Field(ge=1920)
    sex: Literal["male", "female", "other"]
    height_cm: float = Field(ge=80, le=250)
    weight_kg: float = Field(ge=20, le=300)
    target_weight_kg: float | None = Field(default=None, ge=20, le=300)
    occupation: str = Field(default="", max_length=100)
    activity: Literal["sedentary", "light", "moderate", "active"]
    work_mode: Literal["office", "home", "hybrid", "none"]
    work_start: HHMM | None = None
    work_end: HHMM | None = None
    commute_minutes: int = Field(default=0, ge=0, le=300)
    wake_time: HHMM
    bed_time: HHMM
    workout_time: HHMM | None = None
    diet: Literal["veg", "eggetarian", "non_veg", "vegan", "jain"]
    cuisine: str = Field(default="", max_length=100)
    usual_meals: dict[Slot, UsualMeal] = {}
    allergies: Words = Field(default=[], max_length=20)
    dislikes: Words = Field(default=[], max_length=20)
    conditions: list[Condition] = Field(default=[], max_length=9)
    health_notes: str = Field(default="", max_length=500)
    sleep_issues: list[SleepIssue] = Field(default=[], max_length=5)
    stress: Literal["low", "medium", "high"] | None = None
    caffeine_cups: int | None = Field(default=None, ge=0, le=15)
    alcohol: Literal["never", "occasionally", "weekly", "daily"] | None = None
    smoking: Literal["never", "occasionally", "daily"] | None = None
    eating_out: Literal["rarely", "weekly", "often", "daily"] | None = None
    cooking: Literal["self", "family", "canteen", "order"] | None = None
    goal: Literal["lose", "maintain", "gain", "energy", "sleep"]
    screen_goal_minutes: int = Field(default=180, ge=0, le=1440)
    water_goal_ml: int = Field(default=2500, ge=500, le=8000)

    @model_validator(mode="after")
    def _check(self):
        if self.birth_year > date.today().year - 10:
            raise ValueError("Mirrorly's coach is for people 10 and older")
        if (self.work_start is None) != (self.work_end is None):
            raise ValueError("Give both work start and end times, or neither")
        self.allergies = list(dict.fromkeys(a.strip().lower() for a in self.allergies if a.strip()))
        self.dislikes = list(dict.fromkeys(a.strip().lower() for a in self.dislikes if a.strip()))
        self.height_cm, self.weight_kg = round(self.height_cm, 1), round(self.weight_kg, 1)
        if self.target_weight_kg is not None:
            self.target_weight_kg = round(self.target_weight_kg, 1)
        return self


class ProfileOut(ProfileIn):
    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="after")
    def _check(self):  # stored data was validated on the way in
        return self


class DayIn(BaseModel):
    """Partial check-in: only the fields sent change; null clears one."""
    bed_time: HHMM | None = None
    wake_time: HHMM | None = None
    sleep_quality: int | None = Field(default=None, ge=1, le=5)
    screen_minutes: int | None = Field(default=None, ge=0, le=1440)
    water_ml: int | None = Field(default=None, ge=0, le=10000)
    exercise_minutes: int | None = Field(default=None, ge=0, le=1440)
    energy: int | None = Field(default=None, ge=1, le=5)
    note: str | None = Field(default=None, max_length=500)


class Portion(BaseModel):
    """One food with its amount, as entered: 1.5 cup rice, 200 g paneer, 250 ml buttermilk."""
    name: str = Field(min_length=1, max_length=60)
    qty: float = Field(gt=0, le=5000)
    unit: Unit

    def words(self) -> str:
        return f"{self.qty:g} {UNIT_WORDS[self.unit]} {self.name.strip()}"


def described(text: str | None, items: list[Portion]) -> str | None:
    """What the meal model reads: the portions when given (exact amounts estimate better), else the typed text."""
    return (", ".join(i.words() for i in items) if items else (text or "").strip())[:300] or None


class MealIn(BaseModel):
    day: date
    slot: Slot
    eaten_at: HHMM | None = None
    text: str = Field(default="", max_length=300)  # free text, or...
    items: list[Portion] = Field(default=[], max_length=12)  # ...portions

    @model_validator(mode="after")
    def _some(self):
        if not described(self.text, self.items):
            raise ValueError("Add at least one food")
        return self


class MealPatch(BaseModel):
    slot: Slot | None = None
    eaten_at: HHMM | None = None  # send null explicitly to clear
    text: str | None = Field(default=None, min_length=1, max_length=300)
    items: list[Portion] | None = Field(default=None, max_length=12)


class MealOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    day: date
    slot: Slot
    eaten_at: HHMM | None
    text: str
    items: list[dict]
    kcal: int


class DayOut(BaseModel):
    day: date
    bed_time: HHMM | None = None
    wake_time: HHMM | None = None
    sleep_minutes: int | None = None
    sleep_quality: int | None = None
    screen_minutes: int | None = None
    water_ml: int | None = None
    exercise_minutes: int | None = None
    energy: int | None = None
    note: str = ""
    meals: list[MealOut] = []


class TodayOut(BaseModel):
    targets: dict
    insights: list[dict]
    plan: dict | None
    journey: dict | None
    log: DayOut  # the day's check-in and meals (empty when nothing is logged): one request for the whole screen


class DayRef(BaseModel):
    day: date


# ---- shared with the Home chat ----
def get_profile(db, user_id: uuid.UUID) -> WellnessProfile | None:
    return db.get(WellnessProfile, user_id)


def save_checkin(db, user_id: uuid.UUID, day: date, fields: dict) -> WellnessDay:
    """Upsert a check-in with these fields (not committed). Sleep minutes follow bed/wake."""
    row = db.scalar(select(WellnessDay).where(WellnessDay.user_id == user_id, WellnessDay.day == day))
    if not row:
        row = WellnessDay(user_id=user_id, day=day, note="")
        db.add(row)
    for k, v in fields.items():
        setattr(row, k, "" if k == "note" and v is None else v)
    if row.bed_time and row.wake_time:
        row.sleep_minutes = coach.sleep_minutes(row.bed_time, row.wake_time)
    elif {"bed_time", "wake_time"} & fields.keys() and "sleep_minutes" not in fields:
        row.sleep_minutes = None  # a time was cleared; a bare duration ("slept 6 hours", from the chat) stays
    db.flush()
    return row


def add_meal(db, user_id: uuid.UUID, day: date, slot: str, eaten_at: time | None, text: str) -> Meal:
    """Read the meal with the model and store it (not committed)."""
    profile = get_profile(db, user_id)
    items = ai.parse_meal(text, profile.cuisine if profile else "")
    meal = Meal(user_id=user_id, day=day, slot=slot, eaten_at=eaten_at, text=text.strip(), items=items, kcal=sum(i["kcal"] for i in items))
    db.add(meal)
    db.flush()
    return meal


def _day_out(row: WellnessDay | None, meals: list[Meal], day: date) -> DayOut:
    base = {k: getattr(row, k) for k in DayOut.model_fields if k != "meals"} if row else {"day": day}
    return DayOut(**base, meals=[MealOut.model_validate(m) for m in meals if m.day == day])


def _history(db, user_id: uuid.UUID, start: date, end: date) -> tuple[list[WellnessDay], list[Meal]]:
    days = db.scalars(select(WellnessDay).where(WellnessDay.user_id == user_id, WellnessDay.day.between(start, end)).order_by(WellnessDay.day)).all()
    meals = db.scalars(
        select(Meal).where(Meal.user_id == user_id, Meal.day.between(start, end)).order_by(Meal.day, Meal.eaten_at.asc().nulls_last(), Meal.created_at)
    ).all()
    return days, meals


def _need_profile(db, user) -> WellnessProfile:
    p = get_profile(db, user.id)
    if not p:
        raise HTTPException(409, "Set up your Food & Health profile first")
    return p


def _owned_meal(db, id: uuid.UUID, user) -> Meal:
    meal = db.get(Meal, id)
    if not meal or meal.user_id != user.id:
        raise HTTPException(404, "Meal not found")
    return meal


def _save_plan(db, user_id: uuid.UUID, kind: str, day: date, data: dict) -> None:
    row = db.scalar(select(WellnessPlan).where(WellnessPlan.user_id == user_id, WellnessPlan.kind == kind, WellnessPlan.day == day))
    if not row:
        row = WellnessPlan(user_id=user_id, kind=kind, day=day)
        db.add(row)
    row.data, row.model = data, settings.groq_plan_model
    db.commit()


# ---- profile ----
@router.get("/profile", response_model=ProfileOut | None)
def read_profile(db: DB, user: CurrentUser):
    return get_profile(db, user.id)


@router.put("/profile", response_model=ProfileOut)
def write_profile(body: ProfileIn, db: DB, user: CurrentUser):
    p = get_profile(db, user.id) or WellnessProfile(user_id=user.id)
    for k, v in body.model_dump().items():
        setattr(p, k, v)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


# ---- check-ins and meals ----
@router.get("/days", response_model=list[DayOut])
def list_days(start: date, end: date, db: DB, user: CurrentUser):
    if end < start or (end - start).days > 92:
        raise HTTPException(422, "Pick a range of at most 3 months")
    days, meals = _history(db, user.id, start, end)
    rows = {d.day: d for d in days}
    return [_day_out(rows.get(d), meals, d) for d in sorted(rows.keys() | {m.day for m in meals})]


@router.put("/days/{day}", response_model=DayOut)
def write_day(day: date, body: DayIn, db: DB, user: CurrentUser):
    row = save_checkin(db, user.id, day, body.model_dump(exclude_unset=True))
    db.commit()
    _, meals = _history(db, user.id, day, day)
    return _day_out(row, meals, day)


@router.post("/meals", response_model=MealOut, status_code=201)
def create_meal(body: MealIn, db: DB, user: CurrentUser):
    meal = add_meal(db, user.id, body.day, body.slot, body.eaten_at, described(body.text, body.items))
    db.commit()
    return meal


@router.patch("/meals/{id}", response_model=MealOut)
def update_meal(id: uuid.UUID, body: MealPatch, db: DB, user: CurrentUser):
    meal = _owned_meal(db, id, user)
    changes = body.model_dump(exclude_unset=True)
    text = described(body.text, body.items or [])
    if text and text != meal.text:
        profile = get_profile(db, user.id)
        meal.items = ai.parse_meal(text, profile.cuisine if profile else "")
        meal.kcal = sum(i["kcal"] for i in meal.items)
        meal.text = text
    if changes.get("slot"):
        meal.slot = changes["slot"]
    if "eaten_at" in changes:
        meal.eaten_at = changes["eaten_at"]
    db.commit()
    db.refresh(meal)
    return meal


@router.delete("/meals/{id}", status_code=204)
def delete_meal(id: uuid.UUID, db: DB, user: CurrentUser):
    db.delete(_owned_meal(db, id, user))
    db.commit()


# ---- the coach ----
@router.get("/today", response_model=TodayOut)
def today_view(day: date, db: DB, user: CurrentUser):
    p = _need_profile(db, user)
    journey = db.scalar(select(WellnessPlan).where(WellnessPlan.user_id == user.id, WellnessPlan.kind == "journey").order_by(WellnessPlan.day.desc()).limit(1))
    since = min(day - timedelta(days=HISTORY_DAYS), journey.day if journey else day)
    days, meals = _history(db, user.id, since, day + timedelta(days=1))
    t = coach.targets(p, days, day)
    plan = db.scalar(select(WellnessPlan.data).where(WellnessPlan.user_id == user.id, WellnessPlan.kind == "day", WellnessPlan.day == day))
    return TodayOut(
        log=_day_out(next((d for d in days if d.day == day), None), meals, day),
        targets=t.json(),
        insights=[asdict(i) for i in coach.insights(p, t, days, meals, day)],
        plan=plan,
        journey={**journey.data, "start": journey.day.isoformat(), "weeks": coach.journey_progress(journey.data["weeks"], days, meals, day)} if journey else None,
    )


@router.post("/plan", response_model=dict)
def make_plan(body: DayRef, db: DB, user: CurrentUser):
    """Write (or rewrite) the day's plan from the profile, the last weeks and today's insights."""
    p = _need_profile(db, user)
    days, meals = _history(db, user.id, body.day - timedelta(days=HISTORY_DAYS), body.day)
    t = coach.targets(p, days, body.day)
    data = ai.day_plan(p, t, coach.insights(p, t, days, meals, body.day), days, meals, body.day)
    _save_plan(db, user.id, "day", body.day, data)
    return data


@router.post("/journey", response_model=dict)
def make_journey(body: DayRef, db: DB, user: CurrentUser):
    """Start a new multi-week journey from this day (replaces the previous one)."""
    p = _need_profile(db, user)
    days, meals = _history(db, user.id, body.day - timedelta(days=14), body.day)
    data = ai.journey(p, coach.journey_targets(p, days, meals, body.day), body.day)
    db.execute(delete(WellnessPlan).where(WellnessPlan.user_id == user.id, WellnessPlan.kind == "journey"))
    _save_plan(db, user.id, "journey", body.day, data)
    return data


# ---- answers for the Home chat (figures computed here, never by the model) ----
METRICS = {"sleep": ("sleep_minutes", "minutes"), "screen": ("screen_minutes", "minutes"), "water": ("water_ml", "ml"),
           "exercise": ("exercise_minutes", "minutes"), "energy": ("energy", "scale")}


class HealthAnswer(BaseModel):
    """What the chat shows for a Food & Health question."""
    topic: str
    label: str = ""
    start: date | None = None
    end: date | None = None
    unit: str = ""  # minutes | ml | scale (1-5)
    values: list[dict] = []  # [{"day": "YYYY-MM-DD", "value": n}], logged days only
    avg: float | None = None
    total: float | None = None
    target: float | None = None
    meals: list[MealOut] = []
    heavy_days: int | None = None
    headline: str = ""
    stops: list[dict] = []  # plan: the next stops on today's route
    foods: list[str] = []  # advice: foods the coach suggested


def answer_stats(db, user_id: uuid.UUID, p: WellnessProfile, topic: str, start: date, end: date, label: str) -> HealthAnswer:
    days, meals = _history(db, user_id, start, end)
    if topic == "meals":
        heavy = {m.day for m in meals if any(coach.HEAVY & set(i.get("tags", [])) for i in m.items)}
        return HealthAnswer(topic=topic, label=label, start=start, end=end, meals=[MealOut.model_validate(m) for m in meals[-20:]],
                            total=len(meals), heavy_days=len(heavy))
    field, unit = METRICS[topic]
    values = [{"day": d.day.isoformat(), "value": getattr(d, field)} for d in days if getattr(d, field) is not None]
    nums = [v["value"] for v in values]
    target = {"sleep": coach.sleep_need(p, end), "screen": p.screen_goal_minutes, "water": p.water_goal_ml}.get(topic)
    return HealthAnswer(topic=topic, label=label, start=start, end=end, unit=unit, values=values, target=target,
                        avg=round(sum(nums) / len(nums), 1) if nums else None, total=sum(nums) if nums else None)


def next_stops(db, user_id: uuid.UUID, day: date, now: time | None) -> HealthAnswer | None:
    """The rest of today's route from now (all of it when the time isn't known). None without a plan."""
    plan = db.scalar(select(WellnessPlan.data).where(WellnessPlan.user_id == user_id, WellnessPlan.kind == "day", WellnessPlan.day == day))
    if not plan:
        return None
    stops = plan["stops"]
    if now:
        wake = coach.mins(time.fromisoformat(stops[0]["time"]))
        def since(t: time) -> int:
            return (coach.mins(t) - wake) % 1440
        stops = [s for s in stops if since(time.fromisoformat(s["time"])) > since(now)]
    return HealthAnswer(topic="plan", label="Next on your route", headline=plan["headline"], stops=stops[:4])


def coach_reply(db, user_id: uuid.UUID, p: WellnessProfile, day: date, now: time | None, messages: list[dict]) -> tuple[str, list[str]]:
    days, meals = _history(db, user_id, day - timedelta(days=HISTORY_DAYS), day)
    t = coach.targets(p, days, day)
    plan = db.scalar(select(WellnessPlan.data).where(WellnessPlan.user_id == user_id, WellnessPlan.kind == "day", WellnessPlan.day == day))
    return ai.coach_answer(p, t, coach.insights(p, t, days, meals, day), plan, days, meals, day, now, messages)
