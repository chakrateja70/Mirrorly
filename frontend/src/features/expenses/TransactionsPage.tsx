import { Plus } from 'lucide-react'
import { useState } from 'react'
import { sumMoney, type Expense } from '../../api'
import { useMoney } from '../../auth/useMe'
import ExpenseForm from './ExpenseForm'
import FilterBar from './FilterBar'
import { applyFilters, useFilters } from './filters'
import { useCategories, useExpenses } from './queries'

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

export default function TransactionsPage() {
  const { filters, setFilters } = useFilters()
  const money = useMoney()
  const expenses = useExpenses(filters.start, filters.end)
  const categories = useCategories()
  // undefined = closed, null = adding, Expense = editing
  const [editing, setEditing] = useState<Expense | null | undefined>(undefined)

  const catById = new Map(categories.data?.map((c) => [c.id, c]))
  const shown = applyFilters(expenses.data ?? [], filters)
  const byDay = Map.groupBy(shown, (e) => e.spent_on) // API returns newest first

  return (
    <>
      <FilterBar filters={filters} setFilters={setFilters} categories={categories.data ?? []} />

      <p className="result-line">
        <strong>{money(sumMoney(shown.map((e) => e.amount)))}</strong>
        <span className="muted"> · {shown.length} expense{shown.length === 1 ? '' : 's'}</span>
      </p>
      {expenses.isPending && <p className="muted">Loading…</p>}
      {expenses.error && <p className="error">{expenses.error.message}</p>}
      {expenses.data && shown.length === 0 && (
        <p className="empty">{expenses.data.length ? 'No expenses match these filters.' : 'No expenses in this period. Tap + to add one.'}</p>
      )}

      <div className={expenses.isPlaceholderData ? 'stale' : undefined}>
        {[...byDay].map(([day, items]) => (
          <div key={day} className="day">
            <h3>
              <span>{dayLabel(day)}</span>
              <span>{money(sumMoney(items.map((e) => e.amount)))}</span>
            </h3>
            <ul className="list">
              {items.map((e) => {
                const cat = catById.get(e.category_id)
                return (
                  <li key={e.id}>
                    <button className="item" onClick={() => setEditing(e)}>
                      <span className="dot" style={{ background: cat?.color }} />
                      <span className="grow">
                        <span>{e.note || cat?.name || '—'}</span>
                        <small className="muted">{[e.note && cat?.name, e.payment_method.toUpperCase()].filter(Boolean).join(' · ')}</small>
                      </span>
                      <strong>{money(e.amount)}</strong>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>

      <button className="fab" aria-label="Add expense" title="Add expense" onClick={() => setEditing(null)} disabled={!categories.data}>
        <Plus size={26} aria-hidden />
      </button>
      {editing !== undefined && categories.data && (
        <ExpenseForm expense={editing} categories={categories.data} onClose={() => setEditing(undefined)} />
      )}
    </>
  )
}
