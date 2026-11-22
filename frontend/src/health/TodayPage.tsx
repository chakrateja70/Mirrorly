import { useMutation } from '@tanstack/react-query'
import {
  BedDouble, ChevronLeft, ChevronRight, Dumbbell, Flag, GlassWater, Leaf, LocateFixed, Minus, MoonStar, Plus, RefreshCw,
  Smartphone, Sparkles, Sunrise, Target, ThumbsDown, ThumbsUp, Trash2, UtensilsCrossed, X, Zap,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  api, queryClient, today, type CheckIn, type DayPlan, type HealthDay, type HealthProfile, type HealthToday, type Insight, type Meal, type Slot,
  type Targets, type Unit,
} from '../api'
import { SkeletonList } from '../Skeleton'
import {
  addDays, FOODS, INSIGHT, isNight, LEVELS, liters, nowHHMM, pill, sceneryAt, skyAt, SLOTS, slotFor, STOP, TAG_LABEL, tagTone, UNITS, unitFor,
} from './health'
import { refreshHealth, useHealthToday } from './queries'
import { clock, currentStop, hm, mins, since, slept } from './road'
import Roadmap, { type RoadStop } from './Roadmap'
import { Fold, LevelPicker, Ring } from './ui'

type Mode = 'past' | 'today' | 'future'
type Folds = Partial<Record<'sleep' | 'water' | 'meals' | 'screen' | 'move' | 'energy' | 'coach' | 'targets', boolean>>

/** Saves check-in fields; the screen updates at once (optimistic) and the coach's numbers refresh after. */
function useCheckin(day: string) {
  return useMutation({
    mutationFn: (patch: Partial<CheckIn>) => api<HealthDay>(`/wellness/days/${day}`, { method: 'PUT', body: patch }),
    onMutate: (patch) => queryClient.setQueryData<HealthToday>(['health', 'today', day], (old) => old && { ...old, log: { ...old.log, ...patch } }),
    onSettled: () => refreshHealth(),
  })
}

export default function TodayPage() {
  const profile = useOutletContext<HealthProfile>()
  const [now, setNow] = useState(nowHHMM) // the route's "you are here" moves with the clock
  useEffect(() => {
    const timer = setInterval(() => setNow(nowHHMM()), 60_000)
    return () => clearInterval(timer)
  }, [])
  const t0 = today()
  const [day, setDay] = useState(t0)
  const mode: Mode = day < t0 ? 'past' : day > t0 ? 'future' : 'today'
  const view = useHealthToday(day)
  const [folds, setFolds] = useState<Folds>({ meals: true })
  const fold = (k: keyof Folds) => ({ open: folds[k] ?? false, onOpenChange: (o: boolean) => setFolds((f) => ({ ...f, [k]: o })) })
  const jump = (k: keyof Folds) => { // a ring opens its section and brings it into view
    setFolds((f) => ({ ...f, [k]: true }))
    requestAnimationFrame(() => document.getElementById(`fold-${k}`)?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }))
  }
  const DAYS: [string, string][] = [[addDays(t0, -1), 'Yesterday'], [t0, 'Today'], [addDays(t0, 1), 'Tomorrow']]
  const at = DAYS.findIndex(([d]) => d === day)

  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="icon" aria-label="Previous day" disabled={at <= 0} onClick={() => setDay(DAYS[at - 1][0])}><ChevronLeft aria-hidden /></Button>
        <div className="flex rounded-xl bg-muted p-1" role="group" aria-label="Day">
          {DAYS.map(([d, label]) => (
            <button key={d} aria-pressed={day === d} onClick={() => setDay(d)} className="h-9 rounded-lg px-3.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-sm">
              {label}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="icon" aria-label="Next day" disabled={at >= DAYS.length - 1} onClick={() => setDay(DAYS[at + 1][0])}><ChevronRight aria-hidden /></Button>
      </div>

      {view.isError ? <p className="text-destructive" role="alert">{view.error.message}</p>
        : !view.data ? <SkeletonList label="Loading your day" rows={4} />
          : (
            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <div className="grid gap-3">
                {mode === 'future' ? (
                  <Card className="gap-2 px-5 py-4">
                    <strong className="font-semibold">Planning ahead</strong>
                    <p className="text-sm text-muted-foreground">Make tomorrow's plan tonight: it uses today's sleep, screen time and meals. Log those under Today.</p>
                  </Card>
                ) : (
                  <>
                    <Rings log={view.data.log} t={view.data.targets} onJump={jump} />
                    <Coach items={view.data.insights} {...fold('coach')} />
                    <Logs key={day} day={day} mode={mode} log={view.data.log} t={view.data.targets} profile={profile} fold={fold} />
                  </>
                )}
                <TargetsFold t={view.data.targets} {...fold('targets')} />
              </div>
              <PlanSection day={day} plan={view.data.plan} mode={mode} now={now} meals={view.data.log.meals} />
            </div>
          )}
    </div>
  )
}

/** Four rings: where today stands at a glance. Tap one to open its section. */
function Rings({ log, t, onJump }: { log: HealthDay; t: Targets; onJump: (k: keyof Folds) => void }) {
  const kcal = log.meals.reduce((s, m) => s + m.kcal, 0)
  return (
    <Card className="grid grid-cols-4 gap-1 px-2 py-3">
      <Ring label="Sleep" value={log.sleep_minutes ?? 0} max={t.sleep_need} display={log.sleep_minutes != null ? hm(log.sleep_minutes) : '–'} sub={`of ${hm(t.sleep_need)}`} color="#6366f1" onClick={() => onJump('sleep')} />
      <Ring label="Water" value={log.water_ml ?? 0} max={t.water_ml} display={liters(log.water_ml ?? 0).replace(' ml', '')} sub={`of ${liters(t.water_ml)}`} color="#0ea5e9" onClick={() => onJump('water')} />
      <Ring
        label="Food" value={t.kcal ? kcal : log.meals.length} max={t.kcal ?? 3} display={t.kcal ? kcal.toLocaleString() : String(log.meals.length)}
        sub={t.kcal ? `of ${t.kcal.toLocaleString()} kcal` : 'meals'} color="#10b981" onClick={() => onJump('meals')}
      />
      <Ring
        label="Screen" value={log.screen_minutes ?? 0} max={t.screen_target} display={log.screen_minutes != null ? hm(log.screen_minutes) : '–'}
        sub={`≤ ${hm(t.screen_target)}`} color="#f59e0b" over={(log.screen_minutes ?? 0) > t.screen_target} onClick={() => onJump('screen')}
      />
    </Card>
  )
}

function Coach({ items, open, onOpenChange }: { items: Insight[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  if (!items.length) return null
  const warn = items.filter((i) => i.level === 'warn').length
  return (
    <Fold
      id="fold-coach" Icon={Sparkles} tint="bg-violet-500/15 text-violet-600 dark:text-violet-300" title="Coach notes" open={open} onOpenChange={onOpenChange}
      summary={items[0].title + (items.length > 1 ? ` · +${items.length - 1} more` : '')}
      aside={warn > 0 && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">{warn} to fix</span>}
    >
      <ul className="grid gap-3">
        {items.map((i) => {
          const { Icon, tone, label } = INSIGHT[i.level]
          return (
            <li key={i.code} className="flex gap-3">
              <span className={cn('grid size-8 flex-none place-items-center rounded-xl', tone)}><Icon className="size-4" aria-hidden /><span className="sr-only">{label}:</span></span>
              <span className="grid gap-0.5"><strong className="text-sm font-semibold">{i.title}</strong><span className="text-sm text-muted-foreground">{i.tip}</span></span>
            </li>
          )
        })}
      </ul>
    </Fold>
  )
}

function TargetsFold({ t, open, onOpenChange }: { t: Targets; open: boolean; onOpenChange: (o: boolean) => void }) {
  const cut = t.screen_yesterday !== null && t.screen_yesterday > t.screen_target ? t.screen_yesterday - t.screen_target : 0
  const rows: [string, string, string?][] = [
    ['Bed by', clock(t.bedtime), t.bedtime !== t.ideal_bedtime ? `stepping toward ${clock(t.ideal_bedtime)}, 30 min at a time` : undefined],
    ['Sleep', hm(t.sleep_need)],
    ['Screen time', `≤ ${hm(t.screen_target)}`, cut ? `${hm(cut)} less than yesterday` : undefined],
    ['Dinner by', clock(t.dinner_by), '2.5 h before bed'],
    ['Last tea or coffee', clock(t.caffeine_by), '8 h before bed'],
    ['Water', liters(t.water_ml)],
    ...(t.kcal ? [['Energy', `≈ ${t.kcal.toLocaleString()} kcal`] as [string, string]] : []),
    ['Protein', `≈ ${t.protein_g} g`],
  ]
  return (
    <Fold id="fold-targets" Icon={Target} tint="bg-amber-500/15 text-amber-600 dark:text-amber-300" title="Today's targets" summary={`Bed by ${clock(t.bedtime)} · screens ≤ ${hm(t.screen_target)} · ${liters(t.water_ml)} water`} open={open} onOpenChange={onOpenChange}>
      <dl className="grid gap-2.5">
        {rows.map(([k, v, sub]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-2 last:border-0 last:pb-0">
            <dt className="text-sm text-muted-foreground">{k}{sub && <small className="block text-xs text-primary">{sub}</small>}</dt>
            <dd className="font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
    </Fold>
  )
}

/** The day's logging, each part in its own fold: sleep, water, meals, screen time, movement, energy. */
function Logs({ day, mode, log, t, profile, fold }: {
  day: string; mode: Mode; log: HealthDay; t: Targets; profile: HealthProfile; fold: (k: keyof Folds) => { open: boolean; onOpenChange: (o: boolean) => void }
}) {
  const save = useCheckin(day)
  const [f, setF] = useState({
    bed: log.bed_time ?? '', wake: log.wake_time ?? '',
    screenH: log.screen_minutes != null ? String(Math.floor(log.screen_minutes / 60)) : '',
    screenM: log.screen_minutes != null ? String(log.screen_minutes % 60) : '',
    exercise: log.exercise_minutes != null ? String(log.exercise_minutes) : '', ml: '',
  })
  const sleptMin = f.bed && f.wake ? slept(f.bed, f.wake) : log.sleep_minutes
  const screen = f.screenH || f.screenM ? (Number(f.screenH) || 0) * 60 + (Number(f.screenM) || 0) : null
  const saveScreen = () => screen !== log.screen_minutes && save.mutate({ screen_minutes: screen === null ? null : Math.min(screen, 1440) })
  const water = log.water_ml ?? 0
  const addWater = (ml: number) => save.mutate({ water_ml: Math.min(10000, Math.max(0, water + ml)) })
  const kcal = log.meals.reduce((s, m) => s + m.kcal, 0)
  const status = save.isError ? <span className="text-destructive">{save.error.message}</span> : save.isPending ? 'Saving…' : null

  return (
    <>
      {status && <p className="px-1 text-xs text-muted-foreground" role="status">{status}</p>}
      <Fold
        id="fold-sleep" Icon={MoonStar} tint="bg-indigo-500/15 text-indigo-600 dark:text-indigo-300" title="Sleep" {...fold('sleep')}
        summary={sleptMin != null ? `${hm(sleptMin)}${log.sleep_quality ? ` · ${LEVELS[log.sleep_quality - 1].label}` : ''} · need ${hm(t.sleep_need)}` : 'How did you sleep last night?'}
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="ci-bed">Slept at</Label>
            <Input id="ci-bed" type="time" value={f.bed} onChange={(e) => setF({ ...f, bed: e.target.value })} onBlur={() => f.bed !== (log.bed_time ?? '') && save.mutate({ bed_time: f.bed || null })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ci-wake">Woke at</Label>
            <Input id="ci-wake" type="time" value={f.wake} onChange={(e) => setF({ ...f, wake: e.target.value })} onBlur={() => f.wake !== (log.wake_time ?? '') && save.mutate({ wake_time: f.wake || null })} />
          </div>
        </div>
        {sleptMin != null && (
          <p className={cn('flex items-center gap-2 rounded-xl px-3 py-2 text-sm', sleptMin < t.sleep_need - 60 ? 'bg-amber-500/12 text-amber-800 dark:text-amber-300' : 'bg-emerald-500/12 text-emerald-800 dark:text-emerald-300')}>
            <BedDouble className="size-4" aria-hidden /> {hm(sleptMin)} of sleep{sleptMin < t.sleep_need - 60 ? ` · ${hm(t.sleep_need - sleptMin)} short` : ' · well rested'}
          </p>
        )}
        <LevelPicker label="Sleep quality" value={log.sleep_quality} onPick={(v) => save.mutate({ sleep_quality: v })} />
      </Fold>

      <Fold
        id="fold-water" Icon={GlassWater} tint="bg-sky-500/15 text-sky-600 dark:text-sky-300" title="Water" {...fold('water')}
        summary={`${water.toLocaleString()} of ${t.water_ml.toLocaleString()} ml`}
      >
        <div className="grid gap-1.5">
          <div className="flex items-baseline justify-between text-sm">
            <strong className="text-2xl font-semibold tabular-nums">{water.toLocaleString()}<span className="text-sm font-normal text-muted-foreground"> ml</span></strong>
            <span className="text-muted-foreground tabular-nums">{water >= t.water_ml ? 'Goal reached' : `${(t.water_ml - water).toLocaleString()} ml to go`}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-muted" role="meter" aria-label="Water today" aria-valuemin={0} aria-valuemax={t.water_ml} aria-valuenow={water}>
            <span className="block h-full rounded-full bg-linear-to-r from-sky-400 to-blue-600 transition-[width] duration-500" style={{ width: `${Math.min(100, (water / t.water_ml) * 100)}%` }} />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {([['Cup', 150], ['Glass', 250], ['Bottle', 500], ['1 litre', 1000]] as const).map(([name, ml]) => (
            <button key={ml} type="button" onClick={() => addWater(ml)} className="grid justify-items-center gap-0.5 rounded-xl bg-sky-500/10 px-1 py-2.5 text-sky-800 transition-colors hover:bg-sky-500/20 dark:text-sky-200">
              <span className="flex items-center gap-0.5 text-sm font-semibold"><Plus className="size-3.5" aria-hidden />{ml >= 1000 ? '1 L' : `${ml}`}</span>
              <small className="text-[0.7rem] opacity-80">{name}{ml < 1000 && ' · ml'}</small>
            </button>
          ))}
        </div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (Number(f.ml) > 0) { addWater(Number(f.ml)); setF({ ...f, ml: '' }) } }}>
          <Input aria-label="Other amount in ml" type="number" inputMode="numeric" min={10} max={5000} step={10} placeholder="Other amount, ml" value={f.ml} onChange={(e) => setF({ ...f, ml: e.target.value })} />
          <Button variant="secondary" disabled={!(Number(f.ml) > 0)}>Add</Button>
          <Button type="button" variant="ghost" size="icon" aria-label="Remove 250 ml" title="Remove 250 ml" disabled={water <= 0} onClick={() => addWater(-250)}><Minus aria-hidden /></Button>
        </form>
      </Fold>

      <MealsFold day={day} mode={mode} meals={log.meals} profile={profile} kcal={kcal} t={t} fold={fold('meals')} />

      <Fold
        id="fold-screen" Icon={Smartphone} tint="bg-rose-500/15 text-rose-600 dark:text-rose-300" title="Screen time" {...fold('screen')}
        summary={log.screen_minutes != null ? `${hm(log.screen_minutes)} · target ≤ ${hm(t.screen_target)}` : `Outside work · target ≤ ${hm(t.screen_target)}`}
      >
        <div className="flex items-center gap-2">
          <Input aria-label="Hours" type="number" inputMode="numeric" min={0} max={24} className="w-20 tabular-nums" value={f.screenH} onChange={(e) => setF({ ...f, screenH: e.target.value })} onBlur={saveScreen} />
          <span className="text-sm text-muted-foreground">hours</span>
          <Input aria-label="Minutes" type="number" inputMode="numeric" min={0} max={59} step={5} className="w-20 tabular-nums" value={f.screenM} onChange={(e) => setF({ ...f, screenM: e.target.value })} onBlur={saveScreen} />
          <span className="text-sm text-muted-foreground">min</span>
        </div>
        <small className="text-xs text-muted-foreground">Phone and TV outside work. Digital Wellbeing (Android) or Screen Time (iPhone) shows today's total.</small>
      </Fold>

      <Fold
        id="fold-move" Icon={Dumbbell} tint="bg-orange-500/15 text-orange-600 dark:text-orange-300" title="Movement" {...fold('move')}
        summary={log.exercise_minutes != null ? `${log.exercise_minutes} min of exercise` : 'Walks, yoga, gym, sport'}
      >
        <div className="flex flex-wrap items-center gap-2">
          {[0, 15, 30, 45, 60].map((m) => (
            <button key={m} type="button" className={pill} aria-pressed={log.exercise_minutes === m} onClick={() => { setF({ ...f, exercise: String(m) }); save.mutate({ exercise_minutes: m }) }}>
              {m ? `${m} min` : 'None'}
            </button>
          ))}
          <Input
            aria-label="Exercise minutes" type="number" inputMode="numeric" min={0} max={600} placeholder="Other" className="w-24 tabular-nums" value={f.exercise}
            onChange={(e) => setF({ ...f, exercise: e.target.value })}
            onBlur={() => f.exercise !== String(log.exercise_minutes ?? '') && save.mutate({ exercise_minutes: f.exercise === '' ? null : Math.min(Number(f.exercise), 1440) })}
          />
        </div>
      </Fold>

      <Fold
        id="fold-energy" Icon={Zap} tint="bg-yellow-500/15 text-yellow-700 dark:text-yellow-300" title="Energy" {...fold('energy')}
        summary={log.energy ? `Feeling ${LEVELS[log.energy - 1].label.toLowerCase()}` : 'How do you feel today?'}
      >
        <LevelPicker label="Energy today" value={log.energy} onPick={(v) => save.mutate({ energy: v })} />
      </Fold>
    </>
  )
}

/** The model's amount without the food's own name: ("Idli", "2 idlis") -> "2" */
function amount(name: string, qty: string) {
  const at = qty.toLowerCase().indexOf(name.toLowerCase())
  if (at < 0) return qty
  return (qty.slice(0, at) + qty.slice(at + name.length).replace(/^s(?=\s|$)/i, '')).replace(/\s+/g, ' ').trim()
}
const mealName = (m: Meal) => m.items.map((i) => (amount(i.name, i.qty) ? `${i.name} (${amount(i.name, i.qty)})` : i.name)).join(', ') || m.text
const uniqueTags = (m: Meal) => [...new Set(m.items.flatMap((i) => i.tags))]

/** Meals by slot: what's logged (tap to edit) and an "Add" that opens the portion builder for that slot. */
function MealsFold({ day, mode, meals, profile, kcal, t, fold }: {
  day: string; mode: Mode; meals: Meal[]; profile: HealthProfile; kcal: number; t: Targets; fold: { open: boolean; onOpenChange: (o: boolean) => void }
}) {
  const [adding, setAdding] = useState<Slot | null>(null)
  const [editing, setEditing] = useState<Meal | null>(null)
  const protein = meals.reduce((s, m) => s + m.items.reduce((p, i) => p + i.protein_g, 0), 0)
  const [suggested] = useState(() => slotFor(new Date().getHours())) // the meal you are probably logging now
  return (
    <Fold
      id="fold-meals" Icon={UtensilsCrossed} tint="bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" title="Meals" {...fold}
      summary={meals.length ? `${meals.length} logged · ≈ ${kcal.toLocaleString()}${t.kcal ? ` of ${t.kcal.toLocaleString()}` : ''} kcal · ≈ ${protein} of ${t.protein_g} g protein` : 'Add what you eat, with amounts'}
    >
      <div className="grid gap-2.5">
        {SLOTS.map((s) => {
          const here = meals.filter((m) => m.slot === s.value)
          const open = adding === s.value
          return (
            <section key={s.value} className={cn('grid gap-2 rounded-xl border p-3', open ? 'border-primary/40 bg-accent/30' : 'border-border/70')} aria-label={s.label}>
              <header className="flex items-center gap-2.5">
                <span className="grid size-8 flex-none place-items-center rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"><s.Icon className="size-4" aria-hidden /></span>
                <span className="grid min-w-0 flex-1">
                  <strong className="text-sm font-semibold">{s.label}</strong>
                  <small className="truncate text-xs text-muted-foreground">
                    {here.length ? `≈ ${here.reduce((a, m) => a + m.kcal, 0)} kcal${here[0].eaten_at ? ` · ${clock(here[0].eaten_at)}` : ''}` : profile.usual_meals[s.value]?.food ? `Usually: ${profile.usual_meals[s.value]!.food}` : 'Nothing yet'}
                  </small>
                </span>
                {!open && (
                  <Button size="sm" variant={here.length || s.value !== suggested ? 'ghost' : 'default'} className="rounded-full" onClick={() => setAdding(s.value)}>
                    <Plus aria-hidden /> Add
                  </Button>
                )}
              </header>
              {here.map((m) => (
                <button key={m.id} onClick={() => setEditing(m)} className="grid gap-1 rounded-lg bg-muted/50 px-3 py-2 text-left transition-colors hover:bg-muted">
                  <span className="text-sm">{mealName(m)}</span>
                  <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    ≈ {m.kcal} kcal
                    {uniqueTags(m).slice(0, 4).map((tag) => <span key={tag} className={cn('rounded-full px-1.5 py-0.5 text-[0.68rem] font-medium', tagTone(tag))}>{TAG_LABEL[tag] ?? tag}</span>)}
                  </span>
                </button>
              ))}
              {open && <MealBuilder day={day} slot={s.value} usual={profile.usual_meals[s.value]?.food ?? ''} isToday={mode === 'today'} onClose={() => setAdding(null)} />}
            </section>
          )
        })}
      </div>
      <small className="text-xs text-muted-foreground">Calories and protein are estimates from the amounts you enter. You can also tell the assistant: "2 chapati and dal for dinner".</small>
      <datalist id="foods">{FOODS.map((x) => <option key={x} value={x} />)}</datalist>
      {editing && <MealDialog meal={editing} onClose={() => setEditing(null)} />}
    </Fold>
  )
}

type Row = { name: string; qty: string; unit: Unit; auto: boolean } // auto: amount still the default, follows the food's usual measure
const blank = (): Row => ({ name: '', qty: '1', unit: 'serving', auto: true })
/** "2 idli" -> {name: idli, qty: 2, unit: piece} */
function rowFrom(text: string): Row {
  const m = text.trim().match(/^(\d+(?:\.\d+)?)\s*(.*)$/)
  const name = (m ? m[2] : text).trim()
  const hint = unitFor(name)
  return { name, qty: m ? m[1] : String(hint.qty), unit: hint.unit, auto: !m }
}

/** Food + amount + unit per row (rice 1.5 cup, paneer 100 g, buttermilk 250 ml): exact amounts give better estimates. */
function MealBuilder({ day, slot, usual, isToday, onClose }: { day: string; slot: Slot; usual: string; isToday: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<Row[]>([blank()])
  const [at, setAt] = useState(isToday ? nowHHMM() : '')
  const [describe, setDescribe] = useState(false)
  const [text, setText] = useState('')
  const filled = rows.filter((r) => r.name.trim() && Number(r.qty) > 0)
  const save = useMutation({
    mutationFn: () => api<Meal>('/wellness/meals', {
      method: 'POST',
      body: { day, slot, eaten_at: at || null, ...(describe ? { text: text.trim() } : { items: filled.map((r) => ({ name: r.name.trim(), qty: Number(r.qty), unit: r.unit })) }) },
    }),
    onSuccess: () => { refreshHealth(); onClose() },
  })
  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const label = SLOTS.find((s) => s.value === slot)!.label.toLowerCase()

  return (
    <form className="grid gap-2.5" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
      {usual && !describe && (
        <button type="button" onClick={() => setRows(usual.split(',').map(rowFrom).filter((r) => r.name))} className="flex items-center gap-1.5 justify-self-start rounded-full bg-emerald-500/12 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-500/20 dark:text-emerald-300">
          <Sparkles className="size-3.5" aria-hidden /> Fill in my usual: {usual}
        </button>
      )}
      {describe ? (
        <Input autoFocus aria-label={`Describe your ${label}`} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. 2 idli, sambar, half cup chutney, filter coffee" />
      ) : (
        <div className="grid gap-2">
          <div className="hidden grid-cols-[minmax(0,1fr)_4.5rem_6rem_2rem] gap-1.5 px-0.5 text-[0.7rem] font-medium text-muted-foreground sm:grid" aria-hidden>
            <span>Food</span><span>Amount</span><span>Unit</span><span />
          </div>
          {rows.map((r, i) => (
            // phones: the food on its own line, amount and unit under it; wider screens: one line
            <div key={i} className="grid grid-cols-[5rem_minmax(0,1fr)_2rem] items-center gap-1.5 rounded-xl bg-card p-1.5 sm:grid-cols-[minmax(0,1fr)_4.5rem_6rem_2rem] sm:bg-transparent sm:p-0">
              <Input
                aria-label={`Food ${i + 1}`} list="foods" maxLength={60} autoFocus={i === rows.length - 1 && i > 0} placeholder="Food, e.g. Rice" value={r.name}
                className="col-span-2 sm:col-span-1"
                onChange={(e) => { const name = e.target.value; setRow(i, { name, ...(r.auto ? { unit: unitFor(name).unit, qty: String(unitFor(name).qty) } : {}) }) }}
              />
              <Button type="button" variant="ghost" size="icon" className="size-8 sm:order-last" aria-label={`Remove food ${i + 1}`} disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, j) => j !== i))}><X aria-hidden /></Button>
              <Input aria-label={`Amount of food ${i + 1}`} type="number" inputMode="decimal" min={0} step="any" className="px-2.5 tabular-nums" value={r.qty} onChange={(e) => setRow(i, { qty: e.target.value, auto: false })} />
              <select
                aria-label={`Unit for food ${i + 1}`} value={r.unit} onChange={(e) => setRow(i, { unit: e.target.value as Unit, auto: false })}
                className="h-10 rounded-lg bg-muted px-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25"
              >
                {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            </div>
          ))}
          <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => setRows([...rows, blank()])}><Plus aria-hidden /> Add another food</Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor={`at-${slot}`} className="text-xs text-muted-foreground">At</Label>
        <Input id={`at-${slot}`} type="time" className="w-36" value={at} onChange={(e) => setAt(e.target.value)} />
        <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setDescribe(!describe)}>{describe ? 'Enter foods with amounts' : 'Describe it instead'}</button>
      </div>
      {save.error && <p className="text-sm text-destructive" role="alert">{save.error.message}</p>}
      <div className="flex gap-2">
        <Button disabled={save.isPending || (describe ? !text.trim() : !filled.length)}>
          {save.isPending ? <><Sparkles className="animate-pulse" aria-hidden /> Reading…</> : `Save ${label}`}
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </form>
  )
}

function MealDialog({ meal, onClose }: { meal: Meal; onClose: () => void }) {
  const [d, setD] = useState({ slot: meal.slot, text: meal.text, eaten_at: meal.eaten_at ?? '' })
  const save = useMutation({
    mutationFn: () => api(`/wellness/meals/${meal.id}`, { method: 'PATCH', body: { ...d, text: d.text.trim(), eaten_at: d.eaten_at || null } }),
    onSuccess: async () => { await refreshHealth(); onClose() },
  })
  const remove = useMutation({
    mutationFn: () => api(`/wellness/meals/${meal.id}`, { method: 'DELETE' }),
    onSuccess: async () => { await refreshHealth(); onClose() },
  })
  const error = save.error ?? remove.error
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
          <DialogHeader>
            <DialogTitle>Edit meal</DialogTitle>
            <DialogDescription>Change what you ate and it's read again.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Which meal">
            {SLOTS.map((s) => <button key={s.value} type="button" className={cn(pill, 'h-8 px-3')} aria-pressed={d.slot === s.value} onClick={() => setD({ ...d, slot: s.value })}>{s.label}</button>)}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="meal-text">What you ate</Label>
            <Input id="meal-text" required maxLength={300} value={d.text} onChange={(e) => setD({ ...d, text: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="meal-at">When</Label>
            <Input id="meal-at" type="time" className="w-32" value={d.eaten_at} onChange={(e) => setD({ ...d, eaten_at: e.target.value })} />
          </div>
          {meal.items.length > 0 && (
            <ul className="grid gap-1 rounded-xl bg-muted p-3 text-sm">
              {meal.items.map((i, n) => <li key={n} className="flex justify-between gap-3"><span>{i.name} <small className="text-muted-foreground">{i.qty}</small></span><span className="text-muted-foreground tabular-nums">≈ {i.kcal} kcal · {i.protein_g} g</span></li>)}
            </ul>
          )}
          {error && <p className="text-sm text-destructive" role="alert">{error.message}</p>}
          <DialogFooter className="flex-row gap-2">
            <Button type="button" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={remove.isPending} onClick={() => confirm('Delete this meal?') && remove.mutate()}>
              <Trash2 aria-hidden /> Delete
            </Button>
            <span className="flex-1" />
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** The day as a drive from sunrise to the stars, with "you are here" on today's. */
function PlanSection({ day, plan, mode, now, meals }: { day: string; plan: DayPlan | null; mode: Mode; now: string; meals: Meal[] }) {
  const make = useMutation({
    mutationFn: () => api<DayPlan>('/wellness/plan', { method: 'POST', body: { day } }),
    onSuccess: () => refreshHealth(),
  })
  const label = mode === 'today' ? "Today's route" : mode === 'future' ? "Tomorrow's route" : "Yesterday's route"

  if (!plan || make.isPending) {
    return (
      <Card className="relative isolate gap-3 overflow-hidden px-5 py-6">
        <span className="absolute -top-16 -right-12 -z-10 size-56 rounded-full bg-amber-300/30 blur-3xl" aria-hidden />
        <span className="absolute -bottom-20 -left-10 -z-10 size-56 rounded-full bg-violet-400/20 blur-3xl" aria-hidden />
        <h2 className="text-lg font-semibold tracking-tight">{label}</h2>
        <p className="text-sm text-muted-foreground">
          {make.isPending ? "Planning your day around your routine, last night's sleep and what you've been eating…"
            : 'Your coach turns your routine, sleep, screen time and recent meals into a drive through the day: what to eat and when, when to move, when screens go off.'}
        </p>
        {make.error && <p className="text-sm text-destructive" role="alert">{make.error.message}</p>}
        <Button size="lg" className="justify-self-start" disabled={make.isPending} onClick={() => make.mutate()}>
          <Sparkles className={cn(make.isPending && 'animate-pulse')} aria-hidden /> {make.isPending ? 'Planning…' : mode === 'future' ? 'Plan tomorrow' : 'Make my plan'}
        </Button>
      </Card>
    )
  }

  const times = plan.stops.map((s) => s.time)
  const at = mode === 'today' ? currentStop(times, now) : -1
  const eaten = new Set(meals.map((m) => m.slot))
  const stops: RoadStop[] = plan.stops.map((s, i) => {
    const { Icon, tint, label: kind } = STOP[s.kind]
    const ate = mode === 'today' && (s.kind === 'meal' || s.kind === 'snack') && eaten.has(slotFor(Math.floor(mins(s.time) / 60)))
    const state = mode === 'past' || i < at || (ate && i !== at) ? 'done' : i === at ? 'current' : 'upcoming'
    return {
      key: `${i}-${s.time}`, label: clock(s.time), sub: kind, title: s.title, Icon, tint, state,
      sky: skyAt(s.time), night: isNight(s.time), Scenery: sceneryAt(s.time),
      children: (s.detail || s.foods.length > 0) && (
        <>
          {s.detail && <p className="text-sm text-muted-foreground">{s.detail}</p>}
          {s.foods.length > 0 && <span className="flex flex-wrap gap-1">{s.foods.map((f) => <span key={f} className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:text-emerald-300">{f}</span>)}</span>}
        </>
      ),
    }
  })
  const done = stops.filter((s) => s.state === 'done').length
  const next = at >= 0 ? plan.stops[at + 1] : undefined
  const toBed = at >= 0 && at < plan.stops.length - 1 ? since(plan.stops[plan.stops.length - 1].time, now) : null
  const reduced = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth')

  return (
    <section className="grid gap-4" aria-label={label}>
      <header className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="grid min-w-0 flex-1 basis-64 gap-0.5">
          <h2 className="text-lg font-semibold tracking-tight">{label}</h2>
          <p className="text-sm text-muted-foreground">{plan.headline}</p>
        </div>
        {at >= 0 && (
          <Button variant="secondary" size="sm" onClick={() => document.querySelector('[data-road-current]')?.scrollIntoView({ block: 'center', behavior: reduced() })}>
            <LocateFixed aria-hidden /> Now
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => make.mutate()} title="Write a fresh plan from your latest logs"><RefreshCw aria-hidden /> Refresh</Button>
      </header>
      {make.error && <p className="text-sm text-destructive" role="alert">{make.error.message}</p>}
      <Roadmap
        stops={stops} label={label}
        start={{ Icon: Sunrise, text: `Rise & shine · ${clock(plan.stops[0].time)}` }}
        finish={{ Icon: Flag, text: `Goodnight · ${clock(plan.stops[plan.stops.length - 1].time)}` }}
        banner={mode === 'today' && (
          <span className="flex items-center gap-2 tabular-nums">
            <span className="font-semibold">{done}/{stops.length}</span>
            <span className="h-1.5 w-14 overflow-hidden rounded-full bg-muted" aria-hidden><span className="block h-full rounded-full bg-linear-to-r from-amber-500 to-fuchsia-500" style={{ width: `${(done / stops.length) * 100}%` }} /></span>
            {next ? <span className="truncate">Next {clock(next.time)} · {next.title}</span> : <span>Last stop: sleep well</span>}
            {toBed !== null && <span className="hidden text-muted-foreground sm:inline">· {hm(toBed)} to bed</span>}
          </span>
        )}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {plan.eat_more.length > 0 && (
          <Card className="gap-2.5 px-4 py-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><ThumbsUp className="size-4 text-emerald-600" aria-hidden /> Eat more</h3>
            <ul className="grid gap-2">{plan.eat_more.map((e) => <li key={e.food} className="text-sm"><strong className="font-medium">{e.food}</strong> <span className="text-muted-foreground">· {e.why}</span></li>)}</ul>
          </Card>
        )}
        {plan.cut_back.length > 0 && (
          <Card className="gap-2.5 px-4 py-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><ThumbsDown className="size-4 text-amber-600" aria-hidden /> Cut back</h3>
            <ul className="grid gap-2">
              {plan.cut_back.map((c) => (
                <li key={c.food} className="text-sm">
                  <strong className="font-medium">{c.food}</strong> <span className="text-muted-foreground">· {c.why}</span>
                  {c.swap && <span className="mt-0.5 flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300"><Leaf className="size-3" aria-hidden /> Try {c.swap}</span>}
                </li>
              ))}
            </ul>
          </Card>
        )}
        {plan.exercises.length > 0 && (
          <Card className="gap-2.5 px-4 py-4 sm:col-span-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Dumbbell className="size-4 text-orange-500" aria-hidden /> Move</h3>
            <ul className="grid gap-2 sm:grid-cols-2">
              {plan.exercises.map((e) => (
                <li key={e.name} className="flex gap-3 text-sm">
                  <span className="grid h-10 min-w-12 place-items-center rounded-xl bg-orange-500/12 text-xs font-semibold text-orange-700 tabular-nums dark:text-orange-300">{e.minutes}m</span>
                  <span className="grid"><strong className="font-medium">{e.name}</strong><span className="text-muted-foreground">{e.when} · {e.why}</span></span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </section>
  )
}
