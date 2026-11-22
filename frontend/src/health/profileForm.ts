// The Food & Health profile as forms edit it, and back (shared by onboarding and the Profile tab).
import type { HealthProfile, Slot } from '../api'
import { liters, SLOTS } from './health'

type Opt<K extends keyof HealthProfile> = NonNullable<HealthProfile[K]> | ''

/** The profile as the form edits it: numbers stay strings until saved, '' = not chosen. */
export type ProfileForm = {
  age: string
  sex: Opt<'sex'>
  height_cm: string
  weight_kg: string
  target_weight_kg: string
  occupation: string
  activity: Opt<'activity'>
  work_mode: HealthProfile['work_mode']
  work_start: string
  work_end: string
  commute_minutes: string
  wake_time: string
  bed_time: string
  workout_time: string
  diet: Opt<'diet'>
  cuisine: string
  usual_meals: Record<Slot, { time: string; food: string }>
  allergies: string // comma separated
  dislikes: string
  conditions: string[]
  health_notes: string
  sleep_issues: string[]
  stress: Opt<'stress'>
  caffeine_cups: string
  alcohol: Opt<'alcohol'>
  smoking: Opt<'smoking'>
  eating_out: Opt<'eating_out'>
  cooking: Opt<'cooking'>
  goal: Opt<'goal'>
  screen_goal_minutes: number
  water_goal_ml: number
}
export type Section = 'about' | 'routine' | 'food' | 'lifestyle' | 'goals'

const YEAR = new Date().getFullYear()
const MEAL_TIMES: Record<Slot, string> = { breakfast: '09:00', lunch: '13:30', snack: '17:00', dinner: '20:30' }
const list = (s: string) => s.split(',').map((a) => a.trim()).filter(Boolean)

export function toForm(p: HealthProfile | null): ProfileForm {
  const meals = Object.fromEntries(SLOTS.map(({ value }) => [value, { time: p?.usual_meals[value]?.time || MEAL_TIMES[value], food: p?.usual_meals[value]?.food ?? '' }]))
  return {
    age: p ? String(YEAR - p.birth_year) : '', sex: p?.sex ?? '', height_cm: p ? String(p.height_cm) : '', weight_kg: p ? String(p.weight_kg) : '',
    target_weight_kg: p?.target_weight_kg ? String(p.target_weight_kg) : '',
    occupation: p?.occupation ?? '', activity: p?.activity ?? '', work_mode: p?.work_mode ?? 'office',
    work_start: p?.work_start ?? '', work_end: p?.work_end ?? '', commute_minutes: p ? String(p.commute_minutes) : '30',
    wake_time: p?.wake_time ?? '07:00', bed_time: p?.bed_time ?? '23:30', workout_time: p?.workout_time ?? '',
    diet: p?.diet ?? '', cuisine: p?.cuisine ?? '', usual_meals: meals as ProfileForm['usual_meals'],
    allergies: p?.allergies.join(', ') ?? '', dislikes: p?.dislikes.join(', ') ?? '', conditions: p?.conditions ?? [], health_notes: p?.health_notes ?? '',
    sleep_issues: p?.sleep_issues ?? [], stress: p?.stress ?? '', caffeine_cups: p?.caffeine_cups != null ? String(p.caffeine_cups) : '',
    alcohol: p?.alcohol ?? '', smoking: p?.smoking ?? '', eating_out: p?.eating_out ?? '', cooking: p?.cooking ?? '',
    goal: p?.goal ?? '', screen_goal_minutes: p?.screen_goal_minutes ?? 180, water_goal_ml: p?.water_goal_ml ?? 2500,
  }
}

const orNull = <T extends string>(v: T | '') => (v === '' ? null : v)

export function toProfile(f: ProfileForm): HealthProfile {
  const working = f.work_mode !== 'none'
  return {
    birth_year: YEAR - Number(f.age), sex: f.sex as HealthProfile['sex'], height_cm: Number(f.height_cm), weight_kg: Number(f.weight_kg),
    target_weight_kg: f.target_weight_kg ? Number(f.target_weight_kg) : null,
    occupation: f.occupation.trim(), activity: f.activity as HealthProfile['activity'], work_mode: f.work_mode,
    work_start: working && f.work_start ? f.work_start : null, work_end: working && f.work_end ? f.work_end : null,
    commute_minutes: f.work_mode === 'office' || f.work_mode === 'hybrid' ? Number(f.commute_minutes) || 0 : 0,
    wake_time: f.wake_time, bed_time: f.bed_time, workout_time: f.workout_time || null,
    diet: f.diet as HealthProfile['diet'], cuisine: f.cuisine.trim(),
    usual_meals: Object.fromEntries(Object.entries(f.usual_meals).filter(([, m]) => m.food.trim()).map(([s, m]) => [s, { time: m.time, food: m.food.trim() }])),
    allergies: list(f.allergies), dislikes: list(f.dislikes), conditions: f.conditions, health_notes: f.health_notes.trim(),
    sleep_issues: f.sleep_issues, stress: orNull(f.stress), caffeine_cups: f.caffeine_cups === '' ? null : Number(f.caffeine_cups),
    alcohol: orNull(f.alcohol), smoking: orNull(f.smoking), eating_out: orNull(f.eating_out), cooking: orNull(f.cooking),
    goal: f.goal as HealthProfile['goal'], screen_goal_minutes: f.screen_goal_minutes, water_goal_ml: f.water_goal_ml,
  }
}

/** The required choices still missing in a section (text, number and time inputs use native validation). */
export function missing(f: ProfileForm, s: Section): string | null {
  if (s === 'about') return !f.sex ? 'Pick your sex: it changes calorie and protein needs.' : !f.activity ? 'Pick how active a normal day is.' : null
  if (s === 'food') return !f.diet ? 'Pick your diet.' : null
  if (s === 'goals') return !f.goal ? 'Pick your main goal.' : null
  return null
}

/** About 35 ml per kg of body weight, rounded to 250 ml. */
export const suggestedWater = (weight: string) => (Number(weight) > 0 ? Math.min(4000, Math.max(1500, Math.round((Number(weight) * 35) / 250) * 250)) : null)

/** A closed fold's one-line summary of what's filled in. */
export function summary(f: ProfileForm, s: Section): string {
  const parts: (string | false)[] =
    s === 'about' ? [f.age && `${f.age} yrs`, f.height_cm && `${f.height_cm} cm`, f.weight_kg && `${f.weight_kg} kg`, f.occupation]
      : s === 'routine' ? [f.wake_time && `up ${f.wake_time}`, f.bed_time && `bed ${f.bed_time}`, f.work_mode !== 'none' && f.work_start && `work ${f.work_start}–${f.work_end}`]
        : s === 'food' ? [f.diet && f.diet.replace('_', '-'), f.cuisine, f.allergies && `avoids ${f.allergies}`]
          : s === 'lifestyle' ? [f.cooking && `food: ${f.cooking}`, f.caffeine_cups && `${f.caffeine_cups} tea/coffee`, f.stress && `${f.stress} stress`]
            : [f.goal && `goal: ${f.goal}`, `water ${liters(f.water_goal_ml)}`, `screens ≤ ${f.screen_goal_minutes / 60}h`]
  return parts.filter(Boolean).join(' · ') || 'Not filled in yet'
}

export const DISCLAIMER = 'General wellness guidance, not medical advice. With a health condition, check changes with your doctor.'
