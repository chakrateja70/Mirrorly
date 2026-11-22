"""The coach's numbers and rules: pure functions, no database and no model.

Everything numeric the user sees (sleep need, bedtime, screen-time target, calories, streaks) is decided here;
the model only turns these facts into words. Inputs are anything with the ORM models' attributes.
Anchors: ICMR-NIN Dietary Guidelines for Indians 2024 (half the plate vegetables and fruit, limit fried food,
sugar and ultra-processed food), 7-9 h sleep for adults, dinner 2-3 h before bed.
"""
from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import date, time, timedelta

FALL_ASLEEP = 15  # minutes between lights out and sleep
DINNER_GAP = 150  # dinner done 2.5 h before bed
CAFFEINE_GAP = 480  # no caffeine in the 8 h before bed
BED_STEP = 30  # a target bedtime never asks for more than this much earlier than usual (shift gradually)
SCREEN_CUT = 0.85  # each step asks for 15% less screen time, never below the user's goal
ACTIVITY = {"sedentary": 1.2, "light": 1.375, "moderate": 1.55, "active": 1.725}
KCAL_FLOOR = {"male": 1500, "female": 1200, "other": 1350}
HEAVY = {"fried", "heavy"}
REPEAT_WATCH = HEAVY | {"sugary", "processed", "refined_carb"}  # rice or dal every day is normal; biryani every day isn't


# ---- time helpers: clock times as minutes; "late" = minutes since noon, so 23:00 < 01:00 for bedtimes ----
def mins(t: time) -> int:
    return t.hour * 60 + t.minute


def clock(m: float) -> time:
    m = round(m) % 1440
    return time(m // 60, m % 60)


def late(t: time) -> int:
    return (mins(t) - 720) % 1440


def from_late(m: float) -> time:
    return clock(m + 720)


def sleep_minutes(bed: time, wake: time) -> int:
    return (mins(wake) - mins(bed)) % 1440


def hm(m: int) -> str:
    """6h 10m / 45m"""
    h, r = divmod(abs(int(m)), 60)
    return f"{h}h {r}m" if h and r else f"{h}h" if h else f"{r}m"


def ampm(t: time) -> str:
    return f"{t.hour % 12 or 12}:{t.minute:02d} {'AM' if t.hour < 12 else 'PM'}"


def round_to(x: float, step: int) -> int:
    return int(round(x / step) * step)


# ---- targets ----
@dataclass
class Targets:
    sleep_need: int  # minutes
    wake: time
    bedtime: time  # tonight's target: the ideal one, or a 30-minute step toward it
    ideal_bedtime: time
    screen_target: int  # minutes, for this day
    screen_yesterday: int | None
    kcal: int | None  # None when a target would be wrong to give (pregnancy)
    protein_g: int
    water_ml: int
    dinner_by: time
    caffeine_by: time

    def json(self) -> dict:
        return {k: (v.strftime("%H:%M") if isinstance(v, time) else v) for k, v in asdict(self).items()}


def age(profile, day: date) -> int:
    return day.year - profile.birth_year


def sleep_need(profile, day: date) -> int:
    a = age(profile, day)
    return 540 if a < 18 else 450 if a >= 65 else 480


def kcal_target(profile, day: date) -> int | None:
    if "pregnant" in (profile.conditions or []):
        return None  # needs change by trimester: not ours to guess
    w, h, a = float(profile.weight_kg), float(profile.height_cm), age(profile, day)
    bmr = 10 * w + 6.25 * h - 5 * a + {"male": 5, "female": -161}.get(profile.sex, -78)  # Mifflin-St Jeor
    kcal = bmr * ACTIVITY[profile.activity]
    if profile.goal == "lose" and a >= 18:  # never a deficit for teenagers
        kcal -= 400
    elif profile.goal == "gain":
        kcal += 300
    return max(KCAL_FLOOR.get(profile.sex, 1350), round_to(kcal, 50))


def _avg_late(times: list[time], default: time) -> float:
    return sum(map(late, times)) / len(times) if times else late(default)


def _recent(days, day: date, n: int) -> list:
    """Check-ins from the n days before `day` (not including it)."""
    return [d for d in days if day - timedelta(days=n) <= d.day < day]


def targets(profile, days, day: date) -> Targets:
    need = sleep_need(profile, day)
    wake = profile.wake_time
    ideal = clock(mins(wake) - need - FALL_ASLEEP)
    usual = _avg_late([d.bed_time for d in _recent(days, day + timedelta(days=1), 7) if d.bed_time], profile.bed_time)
    bed = from_late(round_to(usual - BED_STEP, 5)) if usual - late(ideal) > BED_STEP else ideal

    screens = [d.screen_minutes for d in _recent(days, day, 7) if d.screen_minutes is not None]
    goal = profile.screen_goal_minutes
    screen = max(goal, round_to(sum(screens) / len(screens) * SCREEN_CUT, 15)) if screens else goal
    yesterday = next((d.screen_minutes for d in days if d.day == day - timedelta(days=1)), None)

    w = float(profile.weight_kg)
    protein = round(w * (1.0 if profile.activity in ("moderate", "active") or profile.goal in ("lose", "gain") else 0.83))
    return Targets(
        sleep_need=need, wake=wake, bedtime=bed, ideal_bedtime=ideal, screen_target=screen, screen_yesterday=yesterday,
        kcal=kcal_target(profile, day), protein_g=protein, water_ml=profile.water_goal_ml,
        dinner_by=clock(mins(bed) - DINNER_GAP), caffeine_by=clock(mins(bed) - CAFFEINE_GAP),
    )


# ---- insights ----
@dataclass
class Insight:
    code: str
    level: str  # warn | info | good
    title: str
    tip: str


def _streak(dates: set[date], end: date) -> int:
    """Consecutive days in `dates` ending at `end`, or at the day before when `end` has nothing logged yet."""
    d = end if end in dates else end - timedelta(days=1)
    n = 0
    while d in dates:
        n, d = n + 1, d - timedelta(days=1)
    return n


def _tagged(meals_by_day: dict, tags: set[str], at_least: int = 1) -> set[date]:
    return {d for d, ms in meals_by_day.items() if sum(bool(tags & set(i.get("tags", []))) for m in ms for i in m.items) >= at_least}


def insights(profile, t: Targets, days, meals, day: date) -> list[Insight]:
    out: list[Insight] = []
    by_day = {d.day: d for d in days}
    meals = [m for m in meals if m.day <= day]
    meals_by_day = defaultdict(list)
    for m in meals:
        meals_by_day[m.day].append(m)
    today = by_day.get(day)

    # the same rich dish again and again (the biryani case): the longest current run of one base dish
    bases = defaultdict(set)
    for m in meals:
        for i in m.items:
            if (b := (i.get("base") or "").strip().lower()) and REPEAT_WATCH & set(i.get("tags", [])):
                bases[b].add(m.day)
    runs = sorted(((_streak(ds, day), b) for b, ds in bases.items()), reverse=True)
    if runs and runs[0][0] >= 3:
        n, b = runs[0]
        out.append(Insight("same_food_streak", "warn", f"{b.capitalize()} {n} days in a row",
                           "Give it a break today: pick something different and lighter, like curd rice, dal with a millet roti, "
                           "or idli with sambar, and add a bowl of fruit."))

    heavy = _streak(_tagged(meals_by_day, HEAVY), day)
    if heavy >= 3:
        out.append(Insight("heavy_streak", "warn", f"Heavy or fried food {heavy} days running",
                           "Make today light and cooling: coconut water, buttermilk (chaas), cucumber, curd rice, "
                           "and a couple of extra glasses of water."))

    # sleep
    slept = today.sleep_minutes if today and today.sleep_minutes is not None else None
    if slept is not None and slept < t.sleep_need - 60:
        out.append(Insight("sleep_short", "warn", f"Short sleep last night: {hm(slept)}",
                           f"No caffeine after {ampm(t.caffeine_by)}, keep dinner light, and aim for bed by {ampm(t.bedtime)}."))
    last3 = [by_day[d].sleep_minutes for d in (day - timedelta(days=i) for i in range(3)) if d in by_day and by_day[d].sleep_minutes is not None]
    if len(last3) >= 2 and sum(last3) / len(last3) < 420 and not any(i.code == "sleep_short" for i in out):
        out.append(Insight("sleep_debt", "warn", f"Averaging {hm(sum(last3) // len(last3))} of sleep lately",
                           f"You're building sleep debt. Protect tonight: screens away by {ampm(clock(mins(t.bedtime) - 60))}."))
    if len(last3) == 3 and all(s >= t.sleep_need - 30 for s in last3):
        out.append(Insight("good_sleep_streak", "good", "3 good nights of sleep in a row", "Keep the same bedtime, even on weekends."))
    if today and today.bed_time and late(today.bed_time) > late(t.ideal_bedtime) + 45:
        out.append(Insight("late_bed", "info", f"Went to bed at {ampm(today.bed_time)}",
                           "Shift bedtime 15 to 30 minutes earlier each night, and dim screens an hour before."))

    # screen time: today's if logged, else yesterday's
    shown = today if today and today.screen_minutes is not None else by_day.get(day - timedelta(days=1))
    if shown and shown.screen_minutes is not None:
        over = shown.screen_minutes - profile.screen_goal_minutes
        when = "today" if shown is today else "yesterday"
        if over > 30:
            out.append(Insight("screen_over", "warn", f"Screen time {when}: {hm(shown.screen_minutes)}, {hm(over)} over your goal",
                               f"Today's target is {hm(t.screen_target)}. Try app timers and a phone-free first hour after waking."))
        elif over <= 0:
            out.append(Insight("screen_good", "good", f"Screen time {when} within your goal", "Nice. Keep the phone out of the bedroom."))

    # meal timing (today, or yesterday when today has none yet), on the waking day's clock: 1 AM is after 10 PM
    def awake(x: time) -> int:
        return (mins(x) - mins(t.wake)) % 1440

    for d in (day, day - timedelta(days=1)):
        dinner = [m for m in meals_by_day.get(d, []) if m.slot == "dinner" and m.eaten_at]
        if dinner and awake(dinner[-1].eaten_at) > awake(t.dinner_by):
            out.append(Insight("late_dinner", "info", f"Dinner at {ampm(dinner[-1].eaten_at)}",
                               f"Finish dinner by {ampm(t.dinner_by)} so it's digested before bed. Keep late meals light."))
            break
    for d in (day, day - timedelta(days=1)):
        late_cups = [m for m in meals_by_day.get(d, []) if m.eaten_at and awake(m.eaten_at) > awake(t.caffeine_by)
                     and any("caffeine" in i.get("tags", []) for i in m.items)]
        if late_cups:
            out.append(Insight("late_caffeine", "info", f"Caffeine at {ampm(late_cups[-1].eaten_at)}",
                               f"Caffeine lasts for hours. Switch to herbal tea or warm milk after {ampm(t.caffeine_by)}."))
            break

    # food quality: the latest day with enough meals logged to judge
    full = day if len(meals_by_day.get(day, [])) >= 3 else day - timedelta(days=1)
    full_meals = meals_by_day.get(full, [])
    if len(full_meals) >= 2 and not any({"veg", "fruit"} & set(i.get("tags", [])) for m in full_meals for i in m.items):
        out.append(Insight("low_veg", "info", f"No vegetables or fruit {'today' if full == day else 'yesterday'}",
                           "Half of every plate should be vegetables, greens and fruit: add a sabzi, salad or a fruit."))
    sugary = _streak(_tagged(meals_by_day, {"sugary"}, at_least=2), day)
    if sugary >= 2:
        out.append(Insight("sugar_streak", "info", f"Lots of sweets {sugary} days running",
                           "Swap one sweet for fruit, roasted chana or a handful of nuts."))

    water_day = today if today and today.water_ml is not None else by_day.get(day - timedelta(days=1))
    if water_day and water_day.water_ml is not None and water_day.water_ml < profile.water_goal_ml - 500:
        out.append(Insight("low_water", "info", f"Only {water_day.water_ml:,} ml of water {'so far today' if water_day is today else 'yesterday'}",
                           f"Aim for {profile.water_goal_ml:,} ml: keep a bottle at your desk and drink a glass with every meal."))

    moved = [by_day[d].exercise_minutes for d in sorted(by_day, reverse=True) if d <= day and by_day[d].exercise_minutes is not None][:3]
    if len(moved) == 3 and not any(moved):
        out.append(Insight("sedentary", "info", "No exercise in your last 3 check-ins",
                           "Start small: a 15-minute brisk walk after lunch counts."))

    order = {"warn": 0, "info": 1, "good": 2}
    return sorted(out, key=lambda i: order[i.level])


# ---- journey: weekly targets stepping gradually from where the user is ----
def journey_targets(profile, days, meals, start: date, weeks: int = 6) -> list[dict]:
    recent = [d for d in days if start - timedelta(days=14) <= d.day < start]
    t = targets(profile, days, start)
    bed0 = _avg_late([d.bed_time for d in recent if d.bed_time], profile.bed_time)
    screens = [d.screen_minutes for d in recent if d.screen_minutes is not None]
    screen0 = sum(screens) / len(screens) if screens else profile.screen_goal_minutes
    moved = [d.exercise_minutes for d in recent if d.exercise_minutes is not None]
    move0 = sum(moved) / len(moved) if moved else 0
    by_day = defaultdict(list)
    for m in meals:
        if start - timedelta(days=14) <= m.day < start:
            by_day[m.day].append(m)
    heavy0 = min(7, round(len(_tagged(by_day, HEAVY)) / 2)) if by_day else 3

    out = []
    for w in range(1, weeks + 1):
        out.append({
            "week": w,
            "start": (start + timedelta(weeks=w - 1)).isoformat(),
            "end": (start + timedelta(weeks=w, days=-1)).isoformat(),
            "bedtime": from_late(max(late(t.ideal_bedtime), round_to(bed0 - 20 * w, 5))).strftime("%H:%M"),
            "screen_minutes": max(profile.screen_goal_minutes, round_to(screen0 * SCREEN_CUT ** w, 15)),
            "exercise_minutes": min(45, round_to(max(move0, 10) + 5 * w, 5)),
            "heavy_days": max(1, heavy0 - w),
        })
    return out


def journey_progress(weeks: list[dict], days, meals, today: date) -> list[dict]:
    """Each week's actuals against its targets; status done / current / upcoming."""
    out = []
    for w in weeks:
        s, e = date.fromisoformat(w["start"]), date.fromisoformat(w["end"])
        status = "upcoming" if s > today else "done" if e < today else "current"
        ds = [d for d in days if s <= d.day <= min(e, today)]
        beds = [d.bed_time for d in ds if d.bed_time]
        screens = [d.screen_minutes for d in ds if d.screen_minutes is not None]
        moved = [d.exercise_minutes for d in ds if d.exercise_minutes is not None]
        week_meals = defaultdict(list)
        for m in meals:
            if s <= m.day <= min(e, today):
                week_meals[m.day].append(m)
        bed = from_late(_avg_late(beds, beds[0])).strftime("%H:%M") if beds else None
        actual = {
            "bedtime": bed,
            "screen_minutes": round(sum(screens) / len(screens)) if screens else None,
            "exercise_minutes": round(sum(moved) / len(moved)) if moved else None,
            "heavy_days": len(_tagged(week_meals, HEAVY)) if week_meals else None,
        }
        met = {
            "bedtime": bed is not None and late(time.fromisoformat(bed)) <= late(time.fromisoformat(w["bedtime"])) + 10,
            "screen_minutes": actual["screen_minutes"] is not None and actual["screen_minutes"] <= w["screen_minutes"],
            "exercise_minutes": actual["exercise_minutes"] is not None and actual["exercise_minutes"] >= w["exercise_minutes"],
            "heavy_days": actual["heavy_days"] is not None and actual["heavy_days"] <= w["heavy_days"],
        }
        out.append({**w, "status": status, "actual": actual, "met": met})
    return out
