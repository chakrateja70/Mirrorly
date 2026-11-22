import { dehydrate, hydrate, QueryClient } from '@tanstack/react-query'

declare const __BUILD_ID__: string // vite.config.ts

export const queryClient = new QueryClient({
  // gcTime 1 day: results of pages not on screen stay cached (and saved below), so revisiting them is instant too
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, gcTime: 86_400_000 } },
})

// Stale-while-revalidate across visits: the last results are saved in localStorage and painted instantly on the
// next open, while every query still refetches in the background (staleTime 0). The API is ~0.6 s per call from
// India (more when cold), so this is what makes opening the app feel instant. Saved per build: a deploy that
// changes a response shape never renders old-shaped data.
const CACHE_KEY = 'mirrorly-cache'
try {
  const saved = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null')
  if (saved?.build === __BUILD_ID__) hydrate(queryClient, saved.state)
  queryClient.invalidateQueries({ queryKey: ['me'], refetchType: 'none' }) // me never goes stale: recheck the session once
} catch { /* storage blocked or corrupt: start empty */ }
queryClient.getQueryCache().subscribe((e) => {
  if (e.type !== 'removed' && !(e.type === 'updated' && e.action.type === 'success')) return
  // never save me = null: a restored "logged out" would redirect to /login before the session is rechecked
  const shouldDehydrateQuery = (q: { state: { status: string; data: unknown } }) => q.state.status === 'success' && q.state.data !== null
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ build: __BUILD_ID__, state: dehydrate(queryClient, { shouldDehydrateQuery }) }))
  } catch { /* full or blocked: just not saved */ }
})

/** Logged out or session expired: drop the previous user's data (memory and saved copy), then me = null. */
export function forgetUser() {
  queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' })
  queryClient.setQueryData(['me'], null)
}

// ---- types (mirror backend schemas; money is a decimal string) ----
export type User = { id: string; email: string; name: string; currency: string }
export type Category = { id: string; name: string; color: string; monthly_budget: string | null }
export type PaymentMethod = 'cash' | 'card' | 'upi' | 'bank' | 'other'
export const PAYMENT_METHODS: PaymentMethod[] = ['upi', 'card', 'cash', 'bank', 'other']
export type Expense = {
  id: string
  amount: string
  spent_on: string
  category_id: string
  payment_method: PaymentMethod
  note: string
}
// Fixed payment method -> color (palette validated for colorblind separation in both themes):
// a filter never repaints the survivors.
export const METHOD_COLOR: Record<PaymentMethod, string> = {
  upi: 'var(--series-1)', card: 'var(--series-2)', cash: 'var(--series-3)', bank: 'var(--series-4)', other: 'var(--fold)',
}
export type LoggedExpense = Omit<Expense, 'payment_method'> & { payment_method: PaymentMethod; removed: boolean }
export type Answer = {
  label: string
  start: string
  end: string
  total: string
  count: number
  group_by: 'none' | 'category' | 'payment_method' | 'month' | 'day'
  groups: { key: string; name: string; amount: string }[]
  largest: Expense | null
  budget: string | null
}
/** Money lent to (direction "lent": they owe you) or borrowed from (you owe them) a person. Not spending. */
export type Iou = {
  id: string
  person: string
  direction: 'lent' | 'borrowed'
  amount: string
  repaid: string // paid back so far; equal to amount = settled
  given_on: string
  due_on: string | null
  note: string
}
// ---- Food & Health (backend /wellness). Times are "HH:MM", minutes are numbers. ----
export type Slot = 'breakfast' | 'lunch' | 'snack' | 'dinner'
export type HealthProfile = {
  birth_year: number
  sex: 'male' | 'female' | 'other'
  height_cm: number
  weight_kg: number
  target_weight_kg: number | null
  occupation: string
  activity: 'sedentary' | 'light' | 'moderate' | 'active'
  work_mode: 'office' | 'home' | 'hybrid' | 'none'
  work_start: string | null
  work_end: string | null
  commute_minutes: number
  wake_time: string
  bed_time: string
  workout_time: string | null
  diet: 'veg' | 'eggetarian' | 'non_veg' | 'vegan' | 'jain'
  cuisine: string
  usual_meals: Partial<Record<Slot, { time: string; food: string }>>
  allergies: string[]
  dislikes: string[]
  conditions: string[]
  health_notes: string
  sleep_issues: string[]
  stress: 'low' | 'medium' | 'high' | null
  caffeine_cups: number | null
  alcohol: 'never' | 'occasionally' | 'weekly' | 'daily' | null
  smoking: 'never' | 'occasionally' | 'daily' | null
  eating_out: 'rarely' | 'weekly' | 'often' | 'daily' | null
  cooking: 'self' | 'family' | 'canteen' | 'order' | null
  goal: 'lose' | 'maintain' | 'gain' | 'energy' | 'sleep'
  screen_goal_minutes: number
  water_goal_ml: number
}
export type Unit = 'cup' | 'bowl' | 'plate' | 'piece' | 'slice' | 'g' | 'ml' | 'glass' | 'tbsp' | 'tsp' | 'serving'
/** One food with its amount, as entered for a meal. */
export type Portion = { name: string; qty: number; unit: Unit }
/** One food the model read out of a meal; kcal and protein are estimates (shown with ≈). */
export type MealItem = { name: string; base: string; qty: string; kcal: number; protein_g: number; tags: string[] }
export type Meal = { id: string; day: string; slot: Slot; eaten_at: string | null; text: string; items: MealItem[]; kcal: number }
export type CheckIn = {
  bed_time: string | null
  wake_time: string | null
  sleep_minutes: number | null
  sleep_quality: number | null
  screen_minutes: number | null
  water_ml: number | null
  exercise_minutes: number | null
  energy: number | null
  note: string
}
export type HealthDay = CheckIn & { day: string; meals: Meal[] }
/** Computed by the app (never the model). */
export type Targets = {
  sleep_need: number
  wake: string
  bedtime: string
  ideal_bedtime: string
  screen_target: number
  screen_yesterday: number | null
  kcal: number | null
  protein_g: number
  water_ml: number
  dinner_by: string
  caffeine_by: string
}
export type Insight = { code: string; level: 'warn' | 'info' | 'good'; title: string; tip: string }
export type StopKind = 'wake' | 'hydrate' | 'meal' | 'snack' | 'exercise' | 'work' | 'break' | 'screen' | 'wind_down' | 'sleep'
export type PlanStop = { time: string; kind: StopKind; title: string; detail: string; foods: string[] }
export type DayPlan = {
  headline: string
  stops: PlanStop[]
  eat_more: { food: string; why: string }[]
  cut_back: { food: string; why: string; swap: string }[]
  exercises: { name: string; minutes: number; when: string; why: string }[]
}
type WeekNumbers = { bedtime: string | null; screen_minutes: number | null; exercise_minutes: number | null; heavy_days: number | null }
export type JourneyWeek = {
  week: number
  start: string
  end: string
  bedtime: string
  screen_minutes: number
  exercise_minutes: number
  heavy_days: number
  title: string
  tips: string[]
  status: 'done' | 'current' | 'upcoming'
  actual: WeekNumbers
  met: Record<keyof WeekNumbers, boolean>
}
export type Journey = { headline: string; start: string; weeks: JourneyWeek[] }
/** Everything the Today screen needs, in one request. */
export type HealthToday = { targets: Targets; insights: Insight[]; plan: DayPlan | null; journey: Journey | null; log: HealthDay }
/** What a chat message logged in Food & Health. */
export type HealthLogged = { day: string; meals: Meal[]; checkin: Partial<Record<'bed_time' | 'wake_time', string> & Record<'sleep_minutes' | 'screen_minutes' | 'water_ml' | 'exercise_minutes', number>> }

/** What the chat shows for a Food & Health question: figures from the logs (never the model), next stops, or foods. */
export type HealthAnswer = {
  topic: 'sleep' | 'screen' | 'water' | 'exercise' | 'energy' | 'meals' | 'plan' | 'advice'
  label: string
  start: string | null
  end: string | null
  unit: '' | 'minutes' | 'ml' | 'scale'
  values: { day: string; value: number }[]
  avg: number | null
  total: number | null
  target: number | null
  meals: Meal[]
  heavy_days: number | null
  headline: string
  stops: PlanStop[]
  foods: string[]
}

export type ChatMessage = {
  id: number
  role: 'user' | 'assistant'
  content: string
  logged: LoggedExpense[]
  answer: Answer | null
  ious: Iou[] // recorded, repaid or listed by this reply, as they were then
  health: HealthLogged | null // food, sleep, screen time... this reply logged
  health_answer: HealthAnswer | null // a Food & Health question's answer
  voice: boolean // the user's message was spoken
  age: number // seconds since stored, by the server clock
}
/** GET /expenses/page: count/total cover every match; days = full-day totals for the days on this page. */
export type ExpensePage = { items: Expense[]; count: number; total: string; days: { date: string; spent: string }[] }
export type Summary = {
  month: string
  total: string
  by_category: { category_id: string; name: string; color: string; spent: string; budget: string | null }[]
  by_day: { date: string; spent: string }[]
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** JSON in and out; a FormData body (file upload) is sent as multipart, the browser sets its own Content-Type. */
export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response
  const form = opts.body instanceof FormData
  try {
    res = await fetch(`/api${path}`, {
      method: opts.method ?? 'GET',
      credentials: 'include',
      headers: opts.body === undefined || form ? undefined : { 'Content-Type': 'application/json' },
      body: opts.body === undefined ? undefined : form ? (opts.body as FormData) : JSON.stringify(opts.body),
    })
  } catch {
    throw new ApiError(0, navigator.onLine ? 'Cannot reach the server' : "You're offline")
  }
  // session expired (a 401 from /auth/login or /register is just a wrong password): auth guard sends user to /login
  if (res.status === 401 && (path === '/auth/me' || !path.startsWith('/auth/'))) forgetUser()
  if (!res.ok) {
    const detail = (await res.json().catch(() => null))?.detail
    const msg = typeof detail === 'string'
      ? detail
      : Array.isArray(detail) ? detail.map((d: { msg: string }) => d.msg).join(', ') : `Request failed (${res.status})`
    throw new ApiError(res.status, msg)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

// ---- small shared helpers ----
export const today = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) // local, not UTC
}
export const thisMonth = () => today().slice(0, 7)
/** Sum decimal strings in integer paise/cents to avoid float drift. */
export const sumMoney = (xs: string[]) => (xs.reduce((s, x) => s + Math.round(Number(x) * 100), 0) / 100).toFixed(2)
