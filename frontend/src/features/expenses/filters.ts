import type { Dispatch, SetStateAction } from 'react'
import { useOutletContext } from 'react-router-dom'
import type { Expense, PaymentMethod } from '../../api'

export type Period = 'today' | 'this-month' | 'last-month' | 'last-3' | 'last-6' | 'this-year' | 'custom'
export type Preset = Exclude<Period, 'custom'>
export const PERIODS: [Period, string][] = [
  ['today', 'Today'], ['this-month', 'This month'], ['last-month', 'Last month'], ['last-3', 'Last 3 months'],
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
export type Tab = 'transactions' | 'analytics'
/** What each tab shows until the user picks a date or period: the whole current month. */
export const BASE: Record<Tab, Preset> = { transactions: 'this-month', analytics: 'this-month' }
export type FiltersCtx = { all: Record<Tab, Filters>; setAll: Dispatch<SetStateAction<Record<Tab, Filters>>> }

/** One tab's filters. ExpensesLayout owns them all, so each tab keeps its own while you switch between them. */
export function useFilters(tab: Tab) {
  const { all, setAll } = useOutletContext<FiltersCtx>()
  return { filters: all[tab], setFilters: (f: Filters) => setAll((a) => ({ ...a, [tab]: f })), base: BASE[tab] }
}

/** Local-time YYYY-MM-DD (toISOString would shift to UTC). */
export const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const parseDay = (s: string) => new Date(`${s}T00:00`)

/** Inclusive [start, end] of a preset. Date() rolls months/years over (month -1 = last December). */
export function periodRange(p: Preset, now = new Date()): [string, string] {
  if (p === 'today') return [iso(now), iso(now)]
  const y = now.getFullYear()
  const m = now.getMonth()
  if (p === 'this-year') return [iso(new Date(y, 0, 1)), iso(new Date(y, 11, 31))]
  if (p === 'last-month') return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))]
  const back = { 'this-month': 0, 'last-3': 2, 'last-6': 5 }[p]
  return [iso(new Date(y, m - back, 1)), iso(new Date(y, m + 1, 0))]
}

export function initialFilters(period: Preset = 'this-month'): Filters {
  const [start, end] = periodRange(period)
  return { period, start, end, categories: [], methods: [], min: '', max: '' }
}

/** How many filters differ from the tab's default view (the badge on the Filters button). */
export function activeCount(f: Filters, base: Preset = 'this-month'): number {
  return (f.period === base ? 0 : 1) + f.categories.length + f.methods.length + (f.min.trim() ? 1 : 0) + (f.max.trim() ? 1 : 0)
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

export const PAGE_SIZE = 10

/** Query string for GET /expenses/page (0-based page): the server applies the same filters as applyFilters. */
export function pageQuery(f: Filters, page: number): string {
  const q = new URLSearchParams({ start: f.start, end: f.end, limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) })
  for (const c of f.categories) q.append('category', c)
  for (const m of f.methods) q.append('method', m)
  const [min, max] = [bound(f.min), bound(f.max)]
  if (min !== null) q.set('min_amount', (min / 100).toFixed(2))
  if (max !== null) q.set('max_amount', (max / 100).toFixed(2))
  return q.toString()
}

/** Page buttons (0-based): first, current and last; a one-page gap is shown, longer gaps are null (an ellipsis). */
export function pageNumbers(current: number, pages: number): (number | null)[] {
  const keep = [...new Set([0, current, pages - 1])].filter((p) => p >= 0 && p < pages).sort((a, b) => a - b)
  return keep.flatMap((p, i) => {
    const gap = i ? p - keep[i - 1] : 1
    return gap === 1 ? [p] : gap === 2 ? [p - 1, p] : [null, p]
  })
}

/** Calendar months touched by [start, end]. Budgets are monthly, so 3 months get 3x the limit. */
export function monthsSpanned(start: string, end: string): number {
  const [sy, sm] = start.split('-').map(Number)
  const [ey, em] = end.split('-').map(Number)
  return (ey - sy) * 12 + (em - sm) + 1
}
