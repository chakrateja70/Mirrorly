"""The coach's numbers and rules (pure: no database, no model)."""
from datetime import date, time, timedelta
from types import SimpleNamespace as NS

from app.wellness import coach

TODAY = date(2026, 11, 22)


def profile(**kw):
    base = dict(birth_year=1998, sex="male", height_cm=175, weight_kg=70, activity="sedentary", goal="maintain",
                conditions=[], allergies=[], diet="non_veg", wake_time=time(8, 0), bed_time=time(1, 30),
                screen_goal_minutes=180, water_goal_ml=2500)
    return NS(**(base | kw))


def day(d: date, **kw):
    return NS(**(dict(day=d, bed_time=None, wake_time=None, sleep_minutes=None, screen_minutes=None,
                      water_ml=None, exercise_minutes=None) | kw))


def meal(d: date, slot="lunch", at=None, *items):
    return NS(day=d, slot=slot, eaten_at=at, items=list(items))


def item(base, *tags):
    return {"name": base.capitalize(), "base": base, "tags": list(tags)}


def ago(n):
    return TODAY - timedelta(days=n)


def codes(xs):
    return [i.code for i in xs]


def test_time_helpers():
    assert coach.sleep_minutes(time(23, 30), time(7, 0)) == 450  # across midnight
    assert coach.sleep_minutes(time(1, 0), time(8, 0)) == 420
    assert coach.late(time(23, 0)) < coach.late(time(1, 0))  # 11 PM is earlier than 1 AM as a bedtime
    assert coach.hm(370) == "6h 10m" and coach.hm(45) == "45m" and coach.hm(120) == "2h"
    assert coach.ampm(time(0, 30)) == "12:30 AM" and coach.ampm(time(13, 5)) == "1:05 PM"


def test_targets():
    p = profile()
    t = coach.targets(p, [], TODAY)
    assert t.sleep_need == 480 and t.ideal_bedtime == time(23, 45)  # 8:00 wake - 8 h - 15 min to fall asleep
    assert t.bedtime == time(1, 0)  # usual 1:30 AM: step 30 min earlier, not a jump to 11:45 PM
    assert t.dinner_by == time(22, 30) and t.caffeine_by == time(17, 0)
    assert t.screen_target == 180  # nothing logged: the goal
    assert t.kcal == 2000  # Mifflin-St Jeor 1673.75 * 1.2, rounded to 50
    assert t.protein_g == 58

    # logged bedtimes move the step; close enough to ideal = the ideal itself
    near = [day(ago(i), bed_time=time(0, 0)) for i in range(3)]
    assert coach.targets(p, near, TODAY).bedtime == time(23, 45)
    odd = [day(ago(0), bed_time=time(1, 40)), day(ago(1), bed_time=time(1, 15)), day(ago(2), bed_time=time(1, 30))]
    assert coach.targets(p, odd, TODAY).bedtime == time(1, 0)  # 1:28 average - 30 min, rounded to 5

    # screen time: 15% less than the last week's average, never below the goal
    heavy_screen = [day(ago(i), screen_minutes=360) for i in range(1, 8)]
    t = coach.targets(p, heavy_screen, TODAY)
    assert t.screen_target == 300 and t.screen_yesterday == 360
    assert coach.targets(p, [day(ago(1), screen_minutes=150)], TODAY).screen_target == 180

    # calories: goal adjustments, floors, and no number at all in pregnancy; teens get no deficit
    assert coach.targets(profile(goal="lose"), [], TODAY).kcal == 1600
    assert coach.targets(profile(sex="female", weight_kg=40, height_cm=150, goal="lose"), [], TODAY).kcal == 1200
    assert coach.targets(profile(sex="female", conditions=["pregnant"]), [], TODAY).kcal is None
    assert coach.targets(profile(birth_year=2012, goal="lose"), [], TODAY).kcal == coach.targets(profile(birth_year=2012), [], TODAY).kcal
    assert coach.targets(profile(birth_year=2012), [], TODAY).sleep_need == 540
    assert coach.targets(profile(birth_year=1950), [], TODAY).sleep_need == 450


def test_food_streaks():
    p = profile()
    t = coach.targets(p, [], TODAY)
    biryani = item("biryani", "heavy", "spicy")
    two = [meal(ago(1), "lunch", None, biryani), meal(ago(0), "lunch", None, biryani)]
    assert "same_food_streak" not in codes(coach.insights(p, t, [], two, TODAY))
    three = two + [meal(ago(2), "dinner", None, biryani)]
    got = coach.insights(p, t, [], three, TODAY)
    assert {"same_food_streak", "heavy_streak"} <= set(codes(got))
    tip = next(i for i in got if i.code == "heavy_streak").tip
    assert "coconut water" in tip and "buttermilk" in tip
    assert next(i for i in got if i.code == "same_food_streak").title == "Biryani 3 days in a row"
    # today not logged yet: the streak up to yesterday still counts
    shifted = [meal(ago(i), "lunch", None, biryani) for i in (1, 2, 3)]
    assert "same_food_streak" in codes(coach.insights(p, t, [], shifted, TODAY))
    # everyday staples repeat without a warning
    rice = [meal(ago(i), "lunch", None, item("rice", "whole_grain"), item("dal", "protein")) for i in range(5)]
    assert "same_food_streak" not in codes(coach.insights(p, t, [], rice, TODAY))
    # a gap breaks it; future meals are ignored
    gap = [meal(ago(i), "lunch", None, biryani) for i in (0, 1, 3)] + [meal(TODAY + timedelta(days=1), "lunch", None, biryani)]
    assert "same_food_streak" not in codes(coach.insights(p, t, [], gap, TODAY))


def test_sleep_screen_and_habits():
    p = profile()
    t = coach.targets(p, [], TODAY)
    short = [day(TODAY, bed_time=time(2, 0), wake_time=time(7, 30), sleep_minutes=330, screen_minutes=420)]
    got = coach.insights(p, t, short, [], TODAY)
    assert {"sleep_short", "late_bed", "screen_over"} <= set(codes(got))
    assert got[0].level == "warn"  # warnings first
    assert "sleep_debt" not in codes(got)  # one sleep warning, not two

    debt = [day(ago(0), sleep_minutes=430), day(ago(1), sleep_minutes=380), day(ago(2), sleep_minutes=380)]  # last night ok, average low
    assert "sleep_debt" in codes(coach.insights(p, t, debt, [], TODAY))
    good = [day(ago(i), sleep_minutes=470, screen_minutes=120) for i in range(3)]
    assert {"good_sleep_streak", "screen_good"} <= set(codes(coach.insights(p, t, good, [], TODAY)))

    lazy = [day(ago(i), exercise_minutes=0, water_ml=750) for i in range(3)]
    assert {"sedentary", "low_water"} <= set(codes(coach.insights(p, t, lazy, [], TODAY)))
    assert "low_water" not in codes(coach.insights(p, t, [day(TODAY, water_ml=2100)], [], TODAY))  # within 500 ml of the goal

    late = [meal(TODAY, "dinner", time(23, 15), item("roti", "whole_grain")),
            meal(TODAY, "snack", time(19, 0), item("coffee", "caffeine", "sugary"))]
    assert {"late_dinner", "late_caffeine"} <= set(codes(coach.insights(p, t, [], late, TODAY)))
    early = [meal(TODAY, "breakfast", time(9, 40), item("coffee", "caffeine")), meal(TODAY, "dinner", time(21, 0), item("roti"))]
    assert not {"late_dinner", "late_caffeine"} & set(codes(coach.insights(p, t, [], early, TODAY)))  # morning coffee is fine
    after_midnight = [meal(TODAY, "dinner", time(0, 30), item("roti"))]
    assert "late_dinner" in codes(coach.insights(p, t, [], after_midnight, TODAY))

    no_veg = [meal(ago(1), s, None, item("parotta", "fried", "refined_carb")) for s in ("breakfast", "lunch")]
    assert "low_veg" in codes(coach.insights(p, t, [], no_veg, TODAY))
    with_veg = no_veg + [meal(ago(1), "dinner", None, item("salad", "veg"))]
    assert "low_veg" not in codes(coach.insights(p, t, [], with_veg, TODAY))


def test_journey():
    p = profile()
    weeks = coach.journey_targets(p, [day(ago(i), screen_minutes=400, exercise_minutes=0) for i in range(1, 8)], [], TODAY)
    assert len(weeks) == 6 and weeks[0]["start"] == "2026-11-22" and weeks[0]["end"] == "2026-11-28"
    assert [w["bedtime"] for w in weeks] == ["01:10", "00:50", "00:30", "00:10", "23:50", "23:45"]  # 20 min/week, stops at ideal
    screens = [w["screen_minutes"] for w in weeks]
    assert screens == sorted(screens, reverse=True) and screens[-1] >= 180
    assert [w["exercise_minutes"] for w in weeks] == [15, 20, 25, 30, 35, 40]

    logged = [day(TODAY, bed_time=time(1, 0), screen_minutes=200, exercise_minutes=20)]
    prog = coach.journey_progress(weeks, logged, [], TODAY)
    assert prog[0]["status"] == "current" and prog[1]["status"] == "upcoming"
    assert prog[0]["met"] == {"bedtime": True, "screen_minutes": True, "exercise_minutes": True, "heavy_days": False}
    assert coach.journey_progress(weeks, [], [], TODAY + timedelta(days=8))[0]["status"] == "done"
