import uuid
from datetime import date, datetime, time
from decimal import Decimal

from sqlalchemy import (
    ARRAY, CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, Numeric, SmallInteger, String, Text, Time,
    UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class WellnessProfile(Base):
    """Who the user is and how their day runs: everything the coach personalizes from. One per user."""

    __tablename__ = "wellness_profiles"
    __table_args__ = (
        CheckConstraint("sex IN ('male', 'female', 'other')", name="wellness_sex_valid"),
        CheckConstraint("activity IN ('sedentary', 'light', 'moderate', 'active')", name="wellness_activity_valid"),
        CheckConstraint("work_mode IN ('office', 'home', 'hybrid', 'none')", name="wellness_work_mode_valid"),
        CheckConstraint("diet IN ('veg', 'eggetarian', 'non_veg', 'vegan', 'jain')", name="wellness_diet_valid"),
        CheckConstraint("goal IN ('lose', 'maintain', 'gain', 'energy', 'sleep')", name="wellness_goal_valid"),
        CheckConstraint("height_cm BETWEEN 80 AND 250 AND weight_kg BETWEEN 20 AND 300", name="wellness_body_valid"),
        CheckConstraint("stress IN ('low', 'medium', 'high')", name="wellness_stress_valid"),
        CheckConstraint("alcohol IN ('never', 'occasionally', 'weekly', 'daily')", name="wellness_alcohol_valid"),
        CheckConstraint("smoking IN ('never', 'occasionally', 'daily')", name="wellness_smoking_valid"),
        CheckConstraint("eating_out IN ('rarely', 'weekly', 'often', 'daily')", name="wellness_eating_out_valid"),
        CheckConstraint("cooking IN ('self', 'family', 'canteen', 'order')", name="wellness_cooking_valid"),
        CheckConstraint("water_goal_ml BETWEEN 500 AND 8000", name="wellness_water_goal_valid"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    birth_year: Mapped[int] = mapped_column(SmallInteger)
    sex: Mapped[str] = mapped_column(String(10))
    height_cm: Mapped[Decimal] = mapped_column(Numeric(5, 1))
    weight_kg: Mapped[Decimal] = mapped_column(Numeric(5, 1))
    target_weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(5, 1))
    occupation: Mapped[str] = mapped_column(String(100), server_default="")
    activity: Mapped[str] = mapped_column(String(10))
    work_mode: Mapped[str] = mapped_column(String(10))
    work_start: Mapped[time | None] = mapped_column(Time)
    work_end: Mapped[time | None] = mapped_column(Time)
    commute_minutes: Mapped[int] = mapped_column(SmallInteger, server_default="0")
    wake_time: Mapped[time] = mapped_column(Time)
    bed_time: Mapped[time] = mapped_column(Time)  # usual bedtime today, not the target
    workout_time: Mapped[time | None] = mapped_column(Time)
    diet: Mapped[str] = mapped_column(String(12))
    cuisine: Mapped[str] = mapped_column(String(100), server_default="")
    usual_meals: Mapped[dict] = mapped_column(JSONB, server_default="{}")  # {slot: {"time": "HH:MM", "food": "..."}}
    allergies: Mapped[list[str]] = mapped_column(ARRAY(String(50)), server_default="{}")
    conditions: Mapped[list[str]] = mapped_column(ARRAY(String(20)), server_default="{}")
    health_notes: Mapped[str] = mapped_column(Text, server_default="")
    dislikes: Mapped[list[str]] = mapped_column(ARRAY(String(50)), server_default="{}")  # never suggested, like allergies
    # habits: optional, they sharpen the plan (None = not answered)
    sleep_issues: Mapped[list[str]] = mapped_column(ARRAY(String(20)), server_default="{}")
    stress: Mapped[str | None] = mapped_column(String(10))
    caffeine_cups: Mapped[int | None] = mapped_column(SmallInteger)  # tea/coffee a day
    alcohol: Mapped[str | None] = mapped_column(String(12))
    smoking: Mapped[str | None] = mapped_column(String(12))
    eating_out: Mapped[str | None] = mapped_column(String(12))
    cooking: Mapped[str | None] = mapped_column(String(12))  # who makes their food: realistic suggestions
    goal: Mapped[str] = mapped_column(String(10))
    screen_goal_minutes: Mapped[int] = mapped_column(SmallInteger, server_default="180")
    water_goal_ml: Mapped[int] = mapped_column(SmallInteger, server_default="2500")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class WellnessDay(Base):
    """A day's check-in. Sleep belongs to the day it ended (the night before, woken up this morning)."""

    __tablename__ = "wellness_days"
    __table_args__ = (
        UniqueConstraint("user_id", "day", name="uq_wellness_days_user_day"),
        CheckConstraint("sleep_quality BETWEEN 1 AND 5 AND energy BETWEEN 1 AND 5", name="wellness_day_scales_valid"),
        CheckConstraint("screen_minutes BETWEEN 0 AND 1440 AND exercise_minutes BETWEEN 0 AND 1440", name="wellness_day_minutes_valid"),
        CheckConstraint("water_ml BETWEEN 0 AND 10000", name="wellness_day_water_valid"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    day: Mapped[date] = mapped_column(Date)
    bed_time: Mapped[time | None] = mapped_column(Time)
    wake_time: Mapped[time | None] = mapped_column(Time)
    sleep_minutes: Mapped[int | None] = mapped_column(SmallInteger)  # from bed/wake, computed by the server
    sleep_quality: Mapped[int | None] = mapped_column(SmallInteger)
    screen_minutes: Mapped[int | None] = mapped_column(SmallInteger)
    water_ml: Mapped[int | None] = mapped_column(SmallInteger)
    exercise_minutes: Mapped[int | None] = mapped_column(SmallInteger)
    energy: Mapped[int | None] = mapped_column(SmallInteger)
    note: Mapped[str] = mapped_column(Text, server_default="")


class Meal(Base):
    """What the user ate, as typed, plus the items the model read out of it (estimates, shown with ≈)."""

    __tablename__ = "meals"
    __table_args__ = (
        CheckConstraint("slot IN ('breakfast', 'lunch', 'snack', 'dinner')", name="meal_slot_valid"),
        Index("ix_meals_user_id_day", "user_id", "day"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    day: Mapped[date] = mapped_column(Date)
    slot: Mapped[str] = mapped_column(String(10))
    eaten_at: Mapped[time | None] = mapped_column(Time)
    text: Mapped[str] = mapped_column(String(300))
    items: Mapped[list] = mapped_column(JSONB, server_default="[]")  # [{name, base, qty, kcal, protein_g, tags}]
    kcal: Mapped[int] = mapped_column(Integer, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class WellnessPlan(Base):
    """A generated plan, validated before storing: kind 'day' (that day's route) or 'journey' (weeks from `day`)."""

    __tablename__ = "wellness_plans"
    __table_args__ = (
        UniqueConstraint("user_id", "kind", "day", name="uq_wellness_plans_user_kind_day"),
        CheckConstraint("kind IN ('day', 'journey')", name="wellness_plan_kind_valid"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(10))
    day: Mapped[date] = mapped_column(Date)
    data: Mapped[dict] = mapped_column(JSONB)
    model: Mapped[str] = mapped_column(String(100), server_default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
