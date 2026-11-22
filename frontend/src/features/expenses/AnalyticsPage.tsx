import { CalendarDays, ChartPie, CircleCheck, Receipt, Trophy, TriangleAlert, Wallet, type LucideIcon } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { METHOD_COLOR, PAYMENT_METHODS, today, type Category, type Expense, type PaymentMethod } from '../../api'
import { useMe, useMoney } from '../../auth/useMe'
import { ChartsSkeleton } from '../../Skeleton'
import CategoryAvatar from './CategoryAvatar'
import FilterBar from './FilterBar'
import { applyFilters, iso, monthsSpanned, parseDay, useFilters, type Filters } from './filters'
import { useCategories, useExpenses } from './queries'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MAX_SLICES = 6 // past this the tail folds into one "N more" slice
const DAY_MS = 86_400_000
const TOOLTIP = {
  contentStyle: { background: 'var(--popover)', border: 'none', borderRadius: 12, boxShadow: '0 8px 24px rgb(0 0 0 / 0.18)', padding: '8px 12px' },
  itemStyle: { color: 'var(--foreground)' },
  labelStyle: { color: 'var(--muted-foreground)', marginBottom: 2 },
}
const TICK = { fill: 'var(--muted-foreground)', fontSize: 12 }

const cents = (amount: string) => Math.round(Number(amount) * 100)

type Slice = { key: string; name: string; value: number; color: string; category?: string } // value in cents; category = name for its icon

/** Everything the page shows, computed once per (data, filters) from the filtered list. Money in cents. */
function analyze(list: Expense[], f: Filters, cats: Category[]) {
  const catById = new Map(cats.map((c) => [c.id, c]))
  const byCat = new Map<string, number>()
  const byMethod = new Map<PaymentMethod, number>()
  const byDay = new Map<string, number>()
  const weekday = [0, 0, 0, 0, 0, 0, 0]
  let total = 0
  let largest: Expense | undefined
  for (const e of list) {
    const c = cents(e.amount)
    total += c
    byCat.set(e.category_id, (byCat.get(e.category_id) ?? 0) + c)
    byMethod.set(e.payment_method, (byMethod.get(e.payment_method) ?? 0) + c)
    byDay.set(e.spent_on, (byDay.get(e.spent_on) ?? 0) + c)
    weekday[(parseDay(e.spent_on).getDay() + 6) % 7] += c // Monday first
    if (!largest || c > cents(largest.amount)) largest = e
  }

  const ranked: Slice[] = [...byCat]
    .sort((a, b) => b[1] - a[1])
    .map(([id, value]) => ({ key: id, name: catById.get(id)?.name ?? 'Unknown', value, color: catById.get(id)?.color ?? 'var(--fold)', category: catById.get(id)?.name ?? '' }))
  const tail = ranked.slice(MAX_SLICES)
  const categorySlices = tail.length > 1
    ? [...ranked.slice(0, MAX_SLICES), { key: 'more', name: `${tail.length} more`, value: tail.reduce((s, x) => s + x.value, 0), color: 'var(--fold)' }]
    : ranked
  const methodSlices: Slice[] = PAYMENT_METHODS.filter((m) => byMethod.has(m))
    .map((m) => ({ key: m, name: m.toUpperCase(), value: byMethod.get(m)!, color: METHOD_COLOR[m] }))

  // time series: daily buckets up to ~2 months, monthly beyond; the running total stops at today
  const now = today()
  const start = parseDay(f.start)
  const daily = (parseDay(f.end).getTime() - start.getTime()) / DAY_MS < 62
  const series: { label: string; spent: number; cumulative: number | null }[] = []
  let running = 0
  if (daily) {
    for (const d = new Date(start); iso(d) <= f.end; d.setDate(d.getDate() + 1)) {
      const key = iso(d)
      const spent = byDay.get(key) ?? 0
      running += spent
      series.push({ label: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), spent, cumulative: key <= now ? running : null })
    }
  } else {
    const byMonth = new Map<string, number>()
    for (const [day, v] of byDay) byMonth.set(day.slice(0, 7), (byMonth.get(day.slice(0, 7)) ?? 0) + v)
    const opts: Intl.DateTimeFormatOptions = f.start.slice(0, 4) === f.end.slice(0, 4) ? { month: 'short' } : { month: 'short', year: '2-digit' }
    for (const d = new Date(start.getFullYear(), start.getMonth(), 1); iso(d).slice(0, 7) <= f.end.slice(0, 7); d.setMonth(d.getMonth() + 1)) {
      const key = iso(d).slice(0, 7)
      const spent = byMonth.get(key) ?? 0
      running += spent
      series.push({ label: d.toLocaleDateString(undefined, opts), spent, cumulative: key <= now.slice(0, 7) ? running : null })
    }
  }

  // budgets are monthly limits: scale by the calendar months in range; respect the category filter
  const months = monthsSpanned(f.start, f.end)
  const budgets = cats
    .filter((c) => c.monthly_budget && (!f.categories.length || f.categories.includes(c.id)))
    .map((c) => ({ id: c.id, name: c.name, color: c.color, spent: byCat.get(c.id) ?? 0, budget: cents(c.monthly_budget!) * months }))

  // average over elapsed days only, so a month in progress isn't diluted by future days
  const last = f.end < now ? f.end : now
  const elapsed = f.start > now ? 0 : Math.round((parseDay(last).getTime() - start.getTime()) / DAY_MS) + 1

  return { total, count: list.length, largest, categorySlices, methodSlices, daily, series, weekday, budgets, months, elapsed }
}

function ChartCard({ title, table, children }: { title: string; table?: [string, string][]; children: ReactNode }) {
  return (
    <Card className="gap-4 p-5" aria-label={title} role="region">
      <h3 className="font-semibold tracking-tight">{title}</h3>
      {children}
      {table && (
        <details className="group">
          <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">Show as table</summary>
          <div className="mt-2 max-h-64 overflow-auto rounded-lg bg-muted/50">
            <table className="w-full text-sm tabular-nums">
              <tbody className="divide-y divide-border/60">
                {table.map(([k, v], i) => <tr key={i}><th scope="row" className="px-3 py-1.5 text-left font-normal">{k}</th><td className="px-3 py-1.5 text-right">{v}</td></tr>)}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </Card>
  )
}

/** One headline number, with an icon chip so the four tiles tell apart at a glance. */
function Kpi({ Icon, label, value, note }: { Icon: LucideIcon; label: string; value: string; note: string }) {
  return (
    <Card className="min-w-0 gap-1 p-4">
      <span className="mb-2 grid size-9 place-items-center rounded-xl bg-accent text-accent-foreground"><Icon className="size-[1.125rem]" aria-hidden /></span>
      <span className="text-sm text-muted-foreground">{label}</span>
      <strong className="truncate text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">{value}</strong>
      <small className="truncate text-xs text-muted-foreground">{note}</small>
    </Card>
  )
}

/** A thin progress bar; the fill color carries meaning only together with the text beside it. */
const Meter = ({ pct, color, label }: { pct: number; color: string; label: string }) => (
  <div className="h-2 overflow-hidden rounded-full bg-muted" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
    <span className="block h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
  </div>
)

/**
 * Donut + legend list (the legend carries names, shares and amounts, so color is never the only cue).
 * Hovering a slice or its legend row (tapping, on touch) lifts it out and shows its figures in the hole.
 */
function Donut({ slices, total, fmt, center }: { slices: Slice[]; total: number; fmt: (c: number) => string; center: string }) {
  const [active, setActive] = useState<number | null>(null)
  const on = active === null ? undefined : slices[active]
  const pct = (s: Slice) => Math.round((s.value / total) * 100)
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[minmax(150px,190px)_1fr]" onMouseLeave={() => setActive(null)}>
      <div className="relative">
        <ResponsiveContainer width="100%" height={190}>
          <PieChart>
            <Pie
              data={slices} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="100%" startAngle={90} endAngle={-270}
              stroke="var(--card)" strokeWidth={2} onMouseEnter={(_, i) => setActive(i)} onClick={(_, i) => setActive(i)}
            >
              {slices.map((s, i) => (
                <Cell
                  key={s.key} fill={s.color} fillOpacity={active === null || active === i ? 1 : 0.25}
                  style={{ transition: 'fill-opacity 0.2s', cursor: 'pointer' }}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-content-center justify-items-center text-center" aria-live="polite">
          {on ? (
            <>
              <span className="max-w-[6.5rem] truncate text-xs text-muted-foreground">{on.name}</span>
              <strong className="text-sm font-semibold tabular-nums">{fmt(on.value)}</strong>
              <span className="text-xs font-semibold tabular-nums" style={{ color: on.color }}>{pct(on)}%</span>
            </>
          ) : <strong className="text-[15px] font-semibold">{center}</strong>}
        </div>
      </div>
      <ul className="grid gap-0.5">
        {slices.map((s, i) => (
          <li
            key={s.key} onMouseEnter={() => setActive(i)} onClick={() => setActive(i)}
            className={cn('flex items-center gap-2.5 rounded-lg px-2 py-1 text-sm transition-colors', active === i && 'bg-muted')}
          >
            {s.category === undefined
              ? <span className="mx-[0.4375rem] size-2.5 flex-none rounded-full" style={{ background: s.color }} />
              : <CategoryAvatar name={s.category} color={s.color} small />}
            <span className="min-w-0 flex-1 truncate">{s.name}</span>
            <span className="min-w-[3.5ch] text-right text-muted-foreground tabular-nums">{pct(s)}%</span>
            <strong className="font-semibold tabular-nums">{fmt(s.value)}</strong>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function AnalyticsPage() {
  const { filters, setFilters, base } = useFilters('analytics')
  const money = useMoney()
  const currency = useMe().data?.currency ?? 'INR'
  const expenses = useExpenses(filters.start, filters.end)
  const categories = useCategories()

  const a = useMemo(() => {
    const cats = categories.data ?? []
    const shown = applyFilters(expenses.data ?? [], filters)
    return analyze(shown, filters, cats)
  }, [expenses.data, categories.data, filters])

  const fmt = (c: number) => money(c / 100)
  const compact = new Intl.NumberFormat(undefined, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 })
  const axisMoney = (v: number) => compact.format(v / 100)
  const largestCat = categories.data?.find((c) => c.id === a.largest?.category_id)

  const bar = <FilterBar filters={filters} setFilters={setFilters} categories={categories.data ?? []} base={base} />
  if (expenses.isPending) return <>{bar}<ChartsSkeleton /></>
  return (
    <>
      {bar}
      {expenses.error && <p className="text-destructive">{expenses.error.message}</p>}

      <div className={expenses.isPlaceholderData ? 'stale' : undefined}>
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi Icon={Wallet} label="Total spent" value={fmt(a.total)} note={`${a.count} transaction${a.count === 1 ? '' : 's'}`} />
          <Kpi
            Icon={CalendarDays} label="Daily average" value={a.elapsed ? fmt(Math.round(a.total / a.elapsed)) : '—'}
            note={a.elapsed ? `over ${a.elapsed} day${a.elapsed === 1 ? '' : 's'}` : 'period not started'}
          />
          <Kpi Icon={Receipt} label="Average expense" value={a.count ? fmt(Math.round(a.total / a.count)) : '—'} note="per transaction" />
          <Kpi
            Icon={Trophy} label="Largest expense" value={a.largest ? money(a.largest.amount) : '—'}
            note={a.largest
              ? [a.largest.note || largestCat?.name, parseDay(a.largest.spent_on).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })].filter(Boolean).join(' · ')
              : 'none yet'}
          />
        </div>

        {a.count === 0 ? (
          <Card className="items-center gap-3 px-6 py-12 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground"><ChartPie aria-hidden /></span>
            <p className="text-muted-foreground">{expenses.data?.length ? 'No expenses match these filters.' : 'No expenses in this period yet.'}</p>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <ChartCard title="Spending by category">
              <Donut slices={a.categorySlices} total={a.total} fmt={fmt} center={axisMoney(a.total)} />
            </ChartCard>

            <ChartCard title="By payment method">
              <Donut slices={a.methodSlices} total={a.total} fmt={fmt} center={`${a.methodSlices.length} method${a.methodSlices.length === 1 ? '' : 's'}`} />
            </ChartCard>

            <ChartCard title={a.daily ? 'Daily spending' : 'Monthly spending'} table={a.series.map((s) => [s.label, fmt(s.spent)])}>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={a.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="18%">
                  <CartesianGrid vertical={false} stroke="var(--grid)" />
                  <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={{ stroke: 'var(--border)' }} minTickGap={16} />
                  <YAxis tick={TICK} tickLine={false} axisLine={false} width={64} tickFormatter={axisMoney} />
                  <Tooltip {...TOOLTIP} cursor={{ fill: 'var(--muted)' }} formatter={(v) => fmt(Number(v))} />
                  <Bar dataKey="spent" name="Spent" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Cumulative spend" table={a.series.filter((s) => s.cumulative !== null).map((s) => [s.label, fmt(s.cumulative!)])}>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={a.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--grid)" />
                  <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={{ stroke: 'var(--border)' }} minTickGap={16} />
                  <YAxis tick={TICK} tickLine={false} axisLine={false} width={64} tickFormatter={axisMoney} />
                  <Tooltip {...TOOLTIP} cursor={{ stroke: 'var(--border)' }} formatter={(v) => fmt(Number(v))} />
                  <Area
                    type="monotone" dataKey="cumulative" name="Total so far" connectNulls={false}
                    stroke="var(--series-1)" strokeWidth={2} fill="var(--series-1)" fillOpacity={0.12}
                    dot={false} activeDot={{ r: 4, stroke: 'var(--card)', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="By day of week" table={WEEKDAYS.map((d, i) => [d, fmt(a.weekday[i])])}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={WEEKDAYS.map((label, i) => ({ label, spent: a.weekday[i] }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
                  <CartesianGrid vertical={false} stroke="var(--grid)" />
                  <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
                  <YAxis tick={TICK} tickLine={false} axisLine={false} width={64} tickFormatter={axisMoney} />
                  <Tooltip {...TOOLTIP} cursor={{ fill: 'var(--muted)' }} formatter={(v) => fmt(Number(v))} />
                  <Bar dataKey="spent" name="Spent" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title={a.months > 1 ? `Budgets · ${a.months} months` : 'Budgets'}>
              {a.budgets.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No budgets yet. Set monthly limits in <Link className="font-medium text-primary hover:underline" to="/expenses/categories">Categories &amp; budgets</Link>.
                </p>
              ) : (
                <ul className="grid gap-4">
                  {a.budgets.map((b) => {
                    const pct = (b.spent / b.budget) * 100
                    const over = b.spent > b.budget
                    return (
                      <li key={b.id} className="grid gap-1.5">
                        <div className="flex items-center gap-2.5 text-sm">
                          <CategoryAvatar name={b.name} color={b.color} small />
                          <span className="min-w-0 flex-1 truncate font-medium">{b.name}</span>
                          <span className="text-muted-foreground tabular-nums">{fmt(b.spent)} / {fmt(b.budget)}</span>
                        </div>
                        <Meter pct={pct} color={over ? 'var(--critical)' : b.color} label={`${b.name} budget used`} />
                        {over ? (
                          <small className="flex items-center gap-1 text-xs font-semibold text-critical"><TriangleAlert className="size-3.5" aria-hidden /> Over by {fmt(b.spent - b.budget)}</small>
                        ) : (
                          <small className="flex items-center gap-1 text-xs text-muted-foreground"><CircleCheck className="size-3.5" aria-hidden /> {fmt(b.budget - b.spent)} left · {Math.round(pct)}% used</small>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </ChartCard>
          </div>
        )}
      </div>
    </>
  )
}
