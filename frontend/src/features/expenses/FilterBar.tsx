import { Check, SlidersHorizontal, X } from 'lucide-react'
import { useState } from 'react'
import { PAYMENT_METHODS, type Category } from '../../api'
import { useMoney } from '../../auth/useMe'
import { activeCount, initialFilters, parseDay, PERIODS, periodRange, type Filters, type Period } from './filters'

type Props = { filters: Filters; setFilters: (f: Filters) => void; categories: Category[] }

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
const shortDay = (iso: string) => parseDay(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

/**
 * All filters fold behind one button. Changes are a draft until "Apply" (which folds the panel);
 * "Clear" resets to this month with nothing else filtered. Scopes the list and every chart below it.
 */
export default function FilterBar({ filters, setFilters, categories }: Props) {
  const money = useMoney()
  const [draft, setDraft] = useState<Filters | null>(null) // non-null while the panel is open
  const active = activeCount(filters)

  const summary = [
    filters.period === 'custom' ? `${shortDay(filters.start)} – ${shortDay(filters.end)}` : PERIODS.find(([p]) => p === filters.period)?.[1],
    filters.categories.length === 1
      ? categories.find((c) => c.id === filters.categories[0])?.name
      : filters.categories.length ? `${filters.categories.length} categories` : '',
    filters.methods.map((m) => m.toUpperCase()).join(', '),
    filters.min || filters.max ? `${filters.min ? money(filters.min) : 'any'} – ${filters.max ? money(filters.max) : 'any'}` : '',
  ].filter(Boolean).join(' · ')

  const apply = (f: Filters) => {
    setFilters(f)
    setDraft(null)
  }

  const head = (
    <div className="filter-head">
      <button type="button" aria-expanded={!!draft} onClick={() => setDraft(draft ? null : filters)}>
        <SlidersHorizontal size={16} aria-hidden /> Filters {active > 0 && <span className="badge">{active}</span>}
      </button>
      {active > 0 && !draft && ( // applied filters can be cleared without opening the panel
        <button type="button" className="ghost" onClick={() => apply(initialFilters())}>
          <X size={16} aria-hidden /> Clear
        </button>
      )}
      <span className="filter-summary">{summary}</span>
    </div>
  )
  if (!draft) return <div className="filterbar">{head}</div>

  const set = (patch: Partial<Filters>) => setDraft({ ...draft, ...patch })
  const choosePeriod = (period: Period) => {
    if (period === 'custom') return set({ period }) // keep the current dates as the starting point
    const [start, end] = periodRange(period)
    set({ period, start, end })
  }
  const problem = draft.start > draft.end
    ? 'The start date must be on or before the end date.'
    : draft.min && draft.max && Number(draft.min) > Number(draft.max) ? 'The minimum amount is above the maximum.' : ''

  return (
    <div className="filterbar">
      {head}
      <div className="filter-panel">
        <div>
          <span className="label">Period</span>
          <select aria-label="Period" value={draft.period} onChange={(e) => choosePeriod(e.target.value as Period)}>
            {PERIODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          {draft.period === 'custom' && (
            <div className="range">
              <input type="date" aria-label="From" value={draft.start} onChange={(e) => e.target.value && set({ start: e.target.value })} />
              <span className="muted">to</span>
              <input type="date" aria-label="To" value={draft.end} onChange={(e) => e.target.value && set({ end: e.target.value })} />
            </div>
          )}
        </div>
        <div>
          <span className="label">Categories</span>
          <div className="chips">
            {categories.map((c) => (
              <button key={c.id} type="button" className="chip" aria-pressed={draft.categories.includes(c.id)} onClick={() => set({ categories: toggle(draft.categories, c.id) })}>
                <span className="dot" style={{ background: c.color }} /> {c.name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="label">Paid with</span>
          <div className="chips">
            {PAYMENT_METHODS.map((m) => (
              <button key={m} type="button" className="chip" aria-pressed={draft.methods.includes(m)} onClick={() => set({ methods: toggle(draft.methods, m) })}>
                {m.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="label">Amount</span>
          <div className="range">
            <input
              type="number" inputMode="decimal" min="0" step="0.01" placeholder="Min" aria-label="Minimum amount"
              value={draft.min} onChange={(e) => set({ min: e.target.value })}
            />
            <span className="muted">to</span>
            <input
              type="number" inputMode="decimal" min="0" step="0.01" placeholder="Max" aria-label="Maximum amount"
              value={draft.max} onChange={(e) => set({ max: e.target.value })}
            />
          </div>
        </div>
        {problem && <p className="error" role="alert">{problem}</p>}
        <div className="filter-actions">
          {(active > 0 || activeCount(draft) > 0) && (
            <button type="button" className="ghost" onClick={() => apply(initialFilters())}>
              <X size={16} aria-hidden /> Clear
            </button>
          )}
          <button type="button" className="primary" disabled={!!problem} onClick={() => apply(draft)}>
            <Check size={16} aria-hidden /> Apply
          </button>
        </div>
      </div>
    </div>
  )
}
