import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
})

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
export type ChatMessage = {
  id: number
  role: 'user' | 'assistant'
  content: string
  logged: LoggedExpense[]
  answer: Answer | null
  age: number // seconds since stored, by the server clock
}
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

export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method: opts.method ?? 'GET',
      credentials: 'include',
      headers: opts.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    })
  } catch {
    throw new ApiError(0, navigator.onLine ? 'Cannot reach the server' : "You're offline")
  }
  if (res.status === 401 && !path.startsWith('/auth/')) {
    queryClient.setQueryData(['me'], null) // session expired: auth guard sends user to /login
  }
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
