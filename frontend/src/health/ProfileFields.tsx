import type { ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { liters, pill, SLOTS } from './health'
import { suggestedWater, type ProfileForm, type Section } from './profileForm'
import { Req } from './ui'

type Set = (patch: Partial<ProfileForm>) => void
type Option<T> = readonly [T, string, string?] // value, label, hint

/** A row of choices. `multi` toggles several; `clearable` lets an optional single choice be tapped off again. */
function Pills<T extends string>({ label, value, options, onChange, multi, clearable, required, hint }: {
  label: string; value: T | T[]; options: readonly Option<T>[]; onChange: (v: T) => void; multi?: boolean; clearable?: boolean; required?: boolean; hint?: string
}) {
  const on = (v: T) => (multi ? (value as T[]).includes(v) : value === v)
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">{label}{required && <Req />}{hint && <span className="ml-1.5 font-normal text-muted-foreground">{hint}</span>}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(([v, text, sub]) => (
          <button
            key={v} type="button" aria-pressed={on(v)} onClick={() => onChange(clearable && !multi && value === v ? ('' as T) : v)}
            className={cn(pill, sub && 'grid h-auto justify-items-start rounded-2xl py-2 text-left leading-tight')}
          >
            {text}
            {sub && <small className="text-xs font-normal opacity-75">{sub}</small>}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

const Field = ({ id, label, hint, required, children }: { id: string; label: string; hint?: string; required?: boolean; children: ReactNode }) => (
  <div className="grid content-start gap-2">
    <Label htmlFor={id} className="gap-0">{label}{required && <Req />}</Label>
    {children}
    {hint && <small className="text-xs text-muted-foreground">{hint}</small>}
  </div>
)

const OCCUPATIONS = ['Software engineer', 'Student', 'Teacher', 'Doctor', 'Nurse', 'Homemaker', 'Business owner', 'Sales', 'Driver', 'Designer', 'Retired']
const CUISINES = ['South Indian', 'North Indian', 'Andhra', 'Telangana', 'Tamil', 'Kerala', 'Karnataka', 'Maharashtrian', 'Gujarati', 'Punjabi', 'Bengali', 'Odia', 'Rajasthani']
const CONDITIONS = [
  ['diabetes', 'Diabetes'], ['high_bp', 'High BP'], ['thyroid', 'Thyroid'], ['pcos', 'PCOS'], ['cholesterol', 'High cholesterol'],
  ['acidity', 'Acidity'], ['anemia', 'Anemia'], ['pregnant', 'Pregnant'], ['breastfeeding', 'Breastfeeding'],
] as const
const toggle = (xs: string[], x: string) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x])

/** One section of the profile; the wizard shows one per step, the Profile tab each in its own fold. */
export function ProfileSection({ section, f, set }: { section: Section; f: ProfileForm; set: Set }) {
  if (section === 'about') {
    return (
      <div className="grid gap-5">
        <div className="grid grid-cols-3 gap-3">
          <Field id="age" label="Age" required><Input id="age" type="number" inputMode="numeric" min={10} max={100} required value={f.age} onChange={(e) => set({ age: e.target.value })} /></Field>
          <Field id="height" label="Height, cm" required><Input id="height" type="number" inputMode="decimal" min={80} max={250} step="0.1" required value={f.height_cm} onChange={(e) => set({ height_cm: e.target.value })} /></Field>
          <Field id="weight" label="Weight, kg" required><Input id="weight" type="number" inputMode="decimal" min={20} max={300} step="0.1" required value={f.weight_kg} onChange={(e) => set({ weight_kg: e.target.value })} /></Field>
        </div>
        <Pills label="Sex" required value={f.sex} onChange={(sex) => set({ sex })} options={[['female', 'Female'], ['male', 'Male'], ['other', 'Other']]} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="occupation" label="What do you do?">
            <Input id="occupation" list="occupations" maxLength={100} value={f.occupation} onChange={(e) => set({ occupation: e.target.value })} placeholder="e.g. Software engineer" />
            <datalist id="occupations">{OCCUPATIONS.map((o) => <option key={o} value={o} />)}</datalist>
          </Field>
          <Field id="target" label="Target weight, kg" hint="Only if you want to lose or gain.">
            <Input id="target" type="number" inputMode="decimal" min={20} max={300} step="0.1" value={f.target_weight_kg} onChange={(e) => set({ target_weight_kg: e.target.value })} />
          </Field>
        </div>
        <Pills
          label="How active is a normal day?" required value={f.activity} onChange={(activity) => set({ activity })}
          options={[['sedentary', 'Mostly sitting', 'desk job, little walking'], ['light', 'Lightly active', 'some walking'], ['moderate', 'Active', 'on my feet, or exercise 3-5x a week'], ['active', 'Very active', 'physical work or daily training']]}
        />
      </div>
    )
  }
  if (section === 'routine') {
    const working = f.work_mode !== 'none'
    return (
      <div className="grid gap-5">
        <div className="grid grid-cols-2 gap-3">
          <Field id="wake" label="I wake up at" required><Input id="wake" type="time" required value={f.wake_time} onChange={(e) => set({ wake_time: e.target.value })} /></Field>
          <Field id="bed" label="I usually sleep at" required><Input id="bed" type="time" required value={f.bed_time} onChange={(e) => set({ bed_time: e.target.value })} /></Field>
        </div>
        <Pills label="Where do you work or study?" required value={f.work_mode} onChange={(work_mode) => set({ work_mode })} options={[['office', 'Office / college'], ['home', 'From home'], ['hybrid', 'Hybrid'], ['none', 'Not working now']]} />
        {working && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field id="work-start" label="Starts" required><Input id="work-start" type="time" required value={f.work_start} onChange={(e) => set({ work_start: e.target.value })} /></Field>
            <Field id="work-end" label="Ends" required><Input id="work-end" type="time" required value={f.work_end} onChange={(e) => set({ work_end: e.target.value })} /></Field>
            {f.work_mode !== 'home' && (
              <Field id="commute" label="Commute, min">
                <Input id="commute" type="number" inputMode="numeric" min={0} max={300} value={f.commute_minutes} onChange={(e) => set({ commute_minutes: e.target.value })} />
              </Field>
            )}
          </div>
        )}
        <Field id="workout" label="Workout time" hint="Leave empty if you don't work out yet: the plan will find a slot.">
          <Input id="workout" type="time" value={f.workout_time} onChange={(e) => set({ workout_time: e.target.value })} />
        </Field>
      </div>
    )
  }
  if (section === 'food') {
    return (
      <div className="grid gap-5">
        <Pills
          label="Diet" required value={f.diet} onChange={(diet) => set({ diet })}
          options={[['veg', 'Vegetarian'], ['eggetarian', 'Eggetarian'], ['non_veg', 'Non-vegetarian'], ['vegan', 'Vegan'], ['jain', 'Jain']]}
        />
        <Field id="cuisine" label="Food you grew up with">
          <Input id="cuisine" list="cuisines" maxLength={100} value={f.cuisine} onChange={(e) => set({ cuisine: e.target.value })} placeholder="e.g. Andhra, South Indian" />
          <datalist id="cuisines">{CUISINES.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <fieldset className="grid gap-2.5">
          <legend className="mb-1 text-sm font-medium">What do you usually eat?</legend>
          <small className="-mt-1 text-xs text-muted-foreground">Your real meals, so the plan keeps what's good and suggests swaps for the rest.</small>
          {SLOTS.map(({ value, label, Icon }) => (
            <div key={value} className="grid grid-cols-[6.5rem_1fr] items-center gap-2 sm:grid-cols-[7rem_7.5rem_1fr]">
              <span className="flex items-center gap-2 text-sm"><Icon className="size-4 text-muted-foreground" aria-hidden /> {label}</span>
              <Input
                type="time" aria-label={`${label} time`} className="hidden sm:block" value={f.usual_meals[value].time}
                onChange={(e) => set({ usual_meals: { ...f.usual_meals, [value]: { ...f.usual_meals[value], time: e.target.value } } })}
              />
              <Input
                aria-label={`Usual ${label.toLowerCase()}`} maxLength={200} value={f.usual_meals[value].food}
                placeholder={{ breakfast: 'e.g. 2 idli, sambar, coffee', lunch: 'e.g. rice, dal, curry, curd', snack: 'e.g. tea, biscuits', dinner: 'e.g. 2 chapati, sabzi' }[value]}
                onChange={(e) => set({ usual_meals: { ...f.usual_meals, [value]: { ...f.usual_meals[value], food: e.target.value } } })}
              />
            </div>
          ))}
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="allergies" label="Allergies" hint="Comma separated. Never suggested.">
            <Input id="allergies" maxLength={500} value={f.allergies} onChange={(e) => set({ allergies: e.target.value })} placeholder="e.g. peanuts, shellfish" />
          </Field>
          <Field id="dislikes" label="Foods you dislike" hint="Never suggested either.">
            <Input id="dislikes" maxLength={500} value={f.dislikes} onChange={(e) => set({ dislikes: e.target.value })} placeholder="e.g. bitter gourd, mushrooms" />
          </Field>
        </div>
        <Pills label="Health conditions" hint="(optional)" multi value={f.conditions} options={CONDITIONS} onChange={(c) => set({ conditions: toggle(f.conditions, c) })} />
      </div>
    )
  }
  if (section === 'lifestyle') {
    return (
      <div className="grid gap-5">
        <Pills
          label="Who makes your food?" clearable value={f.cooking} onChange={(cooking) => set({ cooking })}
          options={[['self', 'I cook'], ['family', 'Family cooks'], ['canteen', 'Canteen / mess'], ['order', 'Mostly order in']]}
        />
        <Pills
          label="Eating out or ordering in" clearable value={f.eating_out} onChange={(eating_out) => set({ eating_out })}
          options={[['rarely', 'Rarely'], ['weekly', '1–2× a week'], ['often', '3–5× a week'], ['daily', 'Daily']]}
        />
        <Pills
          label="Tea or coffee a day" clearable value={f.caffeine_cups} onChange={(caffeine_cups) => set({ caffeine_cups })}
          options={[['0', 'None'], ['1', '1 cup'], ['2', '2 cups'], ['3', '3 cups'], ['4', '4 cups'], ['6', '5+ cups']]}
        />
        <Pills
          label="Sleep troubles" multi value={f.sleep_issues} onChange={(s) => set({ sleep_issues: toggle(f.sleep_issues, s) })}
          options={[['falling_asleep', 'Hard to fall asleep'], ['waking_up', 'Wake up at night'], ['snoring', 'Snoring'], ['tired_mornings', 'Tired mornings'], ['irregular', 'Irregular schedule']]}
        />
        <Pills label="Stress most days" clearable value={f.stress} onChange={(stress) => set({ stress })} options={[['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]} />
        <div className="grid gap-5 sm:grid-cols-2">
          <Pills label="Alcohol" clearable value={f.alcohol} onChange={(alcohol) => set({ alcohol })} options={[['never', 'Never'], ['occasionally', 'Sometimes'], ['weekly', 'Weekly'], ['daily', 'Daily']]} />
          <Pills label="Smoking" clearable value={f.smoking} onChange={(smoking) => set({ smoking })} options={[['never', 'Never'], ['occasionally', 'Sometimes'], ['daily', 'Daily']]} />
        </div>
      </div>
    )
  }
  const suggested = suggestedWater(f.weight_kg)
  return (
    <div className="grid gap-5">
      <Pills
        label="Main goal" required value={f.goal} onChange={(goal) => set({ goal })}
        options={[['energy', 'More energy', 'feel fresh all day'], ['sleep', 'Sleep better', 'fix my sleep cycle'], ['lose', 'Lose weight', 'gently, no crash diets'], ['maintain', 'Stay healthy', 'keep it balanced'], ['gain', 'Gain weight', 'build up, eat well']]}
      />
      <Pills
        label="Daily screen-time goal" hint="(outside work)" value={String(f.screen_goal_minutes)} onChange={(v) => set({ screen_goal_minutes: Number(v) })}
        options={[['60', '1h'], ['120', '2h'], ['180', '3h'], ['240', '4h'], ['300', '5h']]}
      />
      <Pills
        label="Daily water goal" hint={suggested ? `(about ${liters(suggested)} suits ${f.weight_kg} kg)` : undefined}
        value={String(f.water_goal_ml)} onChange={(v) => set({ water_goal_ml: Number(v) })}
        options={[1500, 2000, 2500, 3000, 3500, 4000].map((ml) => [String(ml), liters(ml) + (ml === suggested ? ' · suggested' : '')] as const)}
      />
      <Field id="notes" label="Anything else the coach should know?">
        <Input id="notes" maxLength={500} value={f.health_notes} onChange={(e) => set({ health_notes: e.target.value })} placeholder="e.g. night shifts on Fridays, knee pain" />
      </Field>
    </div>
  )
}
