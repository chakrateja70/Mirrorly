import { CircleCheck, TriangleAlert } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Label, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { METHOD_COLOR, PAYMENT_METHODS, today, type Category, type Expense, type PaymentMethod } from '../../api'
import { useMe, useMoney } from '../../auth/useMe'
import FilterBar from './FilterBar'
import { applyFilters, iso, monthsSpanned, parseDay, useFilters, type Filters } from './filters'
import { useCategories, useExpenses } from './queries'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MAX_SLICES = 6 // past this the tail folds into one "N more" slice
const DAY_MS = 86_400_000
const TOOLTIP = {
  contentStyle: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 12px rgb(0 0 0 / 0.15)' },
  itemStyle: { color: 'var(--text)' },
  labelStyle: { color: 'var(--muted)', marginBottom: 2 },
}
const TICK = { fill: 'var(--muted)', fontSize: 12 }

const cents = (amount: string) => Math.round(Number(amount) * 100)

type Slice = { key: string; name: string; value: number; color: string } // value in cents

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
    .map(([id, value]) => ({ key: id, name: catById.get(id)?.name ?? 'Unknown', value, color: catById.get(id)?.color ?? 'var(--fold)' }))
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
    <section className="card chart-card" aria-label={title}>
      <h3>{title}</h3>
      {children}
      {table && (
        <details className="table-view">
          <summary>Show as table</summary>
          <div className="table-scroll">
            <table className="data">
              <tbody>{table.map(([k, v], i) => <tr key={i}><th scope="row">{k}</th><td>{v}</td></tr>)}</tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  )
}

/** Donut + legend list (the legend carries names, shares and amounts, so color is never the only cue). */
function Donut({ slices, total, fmt, center }: { slices: Slice[]; total: number; fmt: (c: number) => string; center: string }) {
  return (
    <div className="donut">
      <ResponsiveContainer width="100%" height={190}>
        <PieChart>
          <Pie data={slices} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="100%" startAngle={90} endAngle={-270} stroke="var(--surface)" strokeWidth={2}>
            {slices.map((s) => <Cell key={s.key} fill={s.color} />)}
            <Label value={center} position="center" fill="var(--text)" fontSize={15} fontWeight={600} />
          </Pie>
          <Tooltip {...TOOLTIP} formatter={(v) => fmt(Number(v))} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="legend">
        {slices.map((s) => (
          <li key={s.key}>
            <span className="dot" style={{ background: s.color }} />
            <span className="grow">{s.name}</span>
            <span className="pct">{Math.round((s.value / total) * 100)}%</span>
            <strong>{fmt(s.value)}</strong>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function AnalyticsPage() {
  const { filters, setFilters } = useFilters()
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

  return (
    <>
      <FilterBar filters={filters} setFilters={setFilters} categories={categories.data ?? []} />
      {expenses.error && <p className="error">{expenses.error.message}</p>}

      <div className={expenses.isPlaceholderData ? 'stale' : undefined}>
        <div className="kpis">
          <div className="kpi">
            <span>Total spent</span>
            <strong>{fmt(a.total)}</strong>
            <small>{a.count} transaction{a.count === 1 ? '' : 's'}</small>
          </div>
          <div className="kpi">
            <span>Daily average</span>
            <strong>{a.elapsed ? fmt(Math.round(a.total / a.elapsed)) : '—'}</strong>
            <small>{a.elapsed ? `over ${a.elapsed} day${a.elapsed === 1 ? '' : 's'}` : 'period not started'}</small>
          </div>
          <div className="kpi">
            <span>Average expense</span>
            <strong>{a.count ? fmt(Math.round(a.total / a.count)) : '—'}</strong>
            <small>per transaction</small>
          </div>
          <div className="kpi">
            <span>Largest expense</span>
            <strong>{a.largest ? money(a.largest.amount) : '—'}</strong>
            <small>
              {a.largest
                ? [a.largest.note || largestCat?.name, parseDay(a.largest.spent_on).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })].filter(Boolean).join(' · ')
                : 'none yet'}
            </small>
          </div>
        </div>

        {expenses.isPending ? <p className="muted">Loading…</p> : a.count === 0 ? (
          <p className="empty">{expenses.data?.length ? 'No expenses match these filters.' : 'No expenses in this period yet.'}</p>
        ) : (
          <div className="charts">
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
                  <Tooltip {...TOOLTIP} cursor={{ fill: 'var(--surface-2)' }} formatter={(v) => fmt(Number(v))} />
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
                    dot={false} activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }}
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
                  <Tooltip {...TOOLTIP} cursor={{ fill: 'var(--surface-2)' }} formatter={(v) => fmt(Number(v))} />
                  <Bar dataKey="spent" name="Spent" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title={a.months > 1 ? `Budgets · ${a.months} months` : 'Budgets'}>
              {a.budgets.length === 0 ? (
                <p className="muted">No budgets yet. Set monthly limits in <Link to="/expenses/categories">Categories &amp; budgets</Link>.</p>
              ) : (
                <ul className="meters">
                  {a.budgets.map((b) => {
                    const pct = (b.spent / b.budget) * 100
                    const over = b.spent > b.budget
                    return (
                      <li key={b.id}>
                        <div className="row">
                          <span className="dot" style={{ background: b.color }} />
                          <span className="spacer">{b.name}</span>
                          <span className="muted">{fmt(b.spent)} / {fmt(b.budget)}</span>
                        </div>
                        <div className="bar" role="meter" aria-label={`${b.name} budget used`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
                          <span style={{ width: `${Math.min(pct, 100)}%`, background: over ? 'var(--critical)' : b.color }} />
                        </div>
                        {over ? (
                          <small className="over"><TriangleAlert size={14} aria-hidden /> Over by {fmt(b.spent - b.budget)}</small>
                        ) : (
                          <small className="muted"><CircleCheck size={14} aria-hidden /> {fmt(b.budget - b.spent)} left · {Math.round(pct)}% used</small>
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
