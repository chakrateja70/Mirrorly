import { useOutletContext } from 'react-router-dom'
import type { Expense, PaymentMethod } from '../../api'

export type Period = 'this-month' | 'last-month' | 'last-3' | 'last-6' | 'this-year' | 'custom'
export const PERIODS: [Period, string][] = [
  ['this-month', 'This month'], ['last-month', 'Last month'], ['last-3', 'Last 3 months'],
  ['last-6', 'Last 6 months'], ['this-year', 'This year'], ['custom', 'Custom range'],
]

export type Filters = {
  period: Period
  start: string // inclusive YYYY-MM-DD
  end: string
  categories: string[] // empty = all
  methods: PaymentMethod[] // empty = all
  min: string // amount bounds as typed; '' = no bound
  max: string
}
export type FiltersCtx = { filters: Filters; setFilters: (f: Filters) => void }

/** Filter state shared by the Transactions and Analytics tabs (owned by ExpensesLayout). */
export const useFilters = () => useOutletContext<FiltersCtx>()

/** Local-time YYYY-MM-DD (toISOString would shift to UTC). */
export const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const parseDay = (s: string) => new Date(`${s}T00:00`)

/** Inclusive [start, end] of a preset. Date() rolls months/years over (month -1 = last December). */
export function periodRange(p: Exclude<Period, 'custom'>, now = new Date()): [string, string] {
  const y = now.getFullYear()
  const m = now.getMonth()
  if (p === 'this-year') return [iso(new Date(y, 0, 1)), iso(new Date(y, 11, 31))]
  if (p === 'last-month') return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))]
  const back = { 'this-month': 0, 'last-3': 2, 'last-6': 5 }[p]
  return [iso(new Date(y, m - back, 1)), iso(new Date(y, m + 1, 0))]
}

export function initialFilters(): Filters {
  const [start, end] = periodRange('this-month')
  return { period: 'this-month', start, end, categories: [], methods: [], min: '', max: '' }
}

/** How many filters differ from the default view (the badge on the Filters button). */
export function activeCount(f: Filters): number {
  return (f.period === 'this-month' ? 0 : 1) + f.categories.length + f.methods.length + (f.min.trim() ? 1 : 0) + (f.max.trim() ? 1 : 0)
}

const cents = (amount: string) => Math.round(Number(amount) * 100)
/** An amount bound in cents, or null when empty / not a number. */
const bound = (s: string) => (s.trim() === '' || !Number.isFinite(Number(s)) ? null : cents(s))

/** Category / payment method / amount filters run client-side over the fetched date range. */
export function applyFilters(list: Expense[], f: Filters): Expense[] {
  const min = bound(f.min)
  const max = bound(f.max)
  return list.filter((e) =>
    (!f.categories.length || f.categories.includes(e.category_id)) &&
    (!f.methods.length || f.methods.includes(e.payment_method)) &&
    (min === null || cents(e.amount) >= min) &&
    (max === null || cents(e.amount) <= max))
}

/** Calendar months touched by [start, end]. Budgets are monthly, so 3 months get 3x the limit. */
export function monthsSpanned(start: string, end: string): number {
  const [sy, sm] = start.split('-').map(Number)
  const [ey, em] = end.split('-').map(Number)
  return (ey - sy) * 12 + (em - sm) + 1
}
