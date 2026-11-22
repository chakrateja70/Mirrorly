import { CalendarDays, Check, SlidersHorizontal, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar-lazy'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PAYMENT_METHODS, type Category } from '../../api'
import { useMoney } from '../../auth/useMe'
import CategoryAvatar from './CategoryAvatar'
import { activeCount, initialFilters, iso, parseDay, PERIODS, periodRange, type Filters, type Period, type Preset } from './filters'

type Props = { filters: Filters; setFilters: (f: Filters) => void; categories: Category[]; base: Preset }

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
const shortDay = (s: string) => parseDay(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
const longDay = (s: string) => parseDay(s).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

/** A pill that switches one filter value on or off. */
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button" aria-pressed={on} onClick={onClick}
      className="inline-flex h-9 items-center gap-2 rounded-full bg-muted px-3.5 text-sm has-[>[aria-hidden]]:pl-1.5 font-medium text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-accent aria-pressed:text-accent-foreground aria-pressed:ring-1 aria-pressed:ring-primary/30"
    >
      {children}
    </button>
  )
}

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="grid gap-2">
    <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</span>
    {children}
  </div>
)

/**
 * The calendar button jumps straight to one day; everything else folds behind "Filters".
 * Panel changes are a draft until "Apply"; "Clear" goes back to the tab's default view (`base`).
 */
export default function FilterBar({ filters, setFilters, categories, base }: Props) {
  const money = useMoney()
  const [draft, setDraft] = useState<Filters | null>(null) // non-null while the panel is open
  const [dayOpen, setDayOpen] = useState(false)
  const active = activeCount(filters, base)
  const oneDay = filters.period === 'custom' && filters.start === filters.end

  const summary = [
    oneDay ? longDay(filters.start)
      : filters.period === 'custom' ? `${shortDay(filters.start)} – ${shortDay(filters.end)}` : PERIODS.find(([p]) => p === filters.period)?.[1],
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
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" aria-expanded={!!draft} onClick={() => setDraft(draft ? null : filters)}>
        <SlidersHorizontal aria-hidden /> Filters
        {active > 0 && <Badge className="h-5 min-w-5 rounded-full px-1.5 tabular-nums">{active}</Badge>}
      </Button>
      <Popover open={dayOpen} onOpenChange={setDayOpen}>
        <PopoverTrigger asChild>
          <Button variant={oneDay ? 'default' : 'secondary'} size="icon" aria-label="Show one day" title="Show one day" data-active={oneDay}>
            <CalendarDays aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single" required autoFocus
            selected={oneDay ? parseDay(filters.start) : undefined}
            defaultMonth={parseDay(filters.end)}
            onSelect={(d) => { // keeps the other filters
              apply({ ...filters, period: 'custom', start: iso(d), end: iso(d) })
              setDayOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
      <span className="filter-summary min-w-0 text-sm text-muted-foreground">{summary}</span>
      {active > 0 && !draft && ( // applied filters can be cleared without opening the panel
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => apply(initialFilters(base))}>
          <X aria-hidden /> Clear
        </Button>
      )}
    </div>
  )
  if (!draft) return <div className="filterbar mb-5 grid gap-3">{head}</div>

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
    <div className="filterbar mb-5 grid gap-3">
      {head}
      <Card className="filter-panel gap-5 p-4 sm:p-5">
        <Field label="Period">
          <Select value={draft.period} onValueChange={(v) => choosePeriod(v as Period)}>
            <SelectTrigger className="w-full sm:w-64" aria-label="Period"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIODS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
          {draft.period === 'custom' && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="secondary" className="w-full justify-start font-normal sm:w-64" aria-label="Date range">
                  <CalendarDays aria-hidden /> {draft.start === draft.end ? longDay(draft.start) : `${shortDay(draft.start)} – ${shortDay(draft.end)}`}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range" autoFocus defaultMonth={parseDay(draft.start)}
                  selected={{ from: parseDay(draft.start), to: parseDay(draft.end) }}
                  onSelect={(r) => r?.from && set({ start: iso(r.from), end: iso(r.to ?? r.from) })}
                />
              </PopoverContent>
            </Popover>
          )}
        </Field>
        <Field label="Categories">
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <Chip key={c.id} on={draft.categories.includes(c.id)} onClick={() => set({ categories: toggle(draft.categories, c.id) })}>
                <CategoryAvatar cat={c} small /> {c.name}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="Paid with">
          <div className="flex flex-wrap gap-2">
            {PAYMENT_METHODS.map((m) => (
              <Chip key={m} on={draft.methods.includes(m)} onClick={() => set({ methods: toggle(draft.methods, m) })}>{m.toUpperCase()}</Chip>
            ))}
          </div>
        </Field>
        <Field label="Amount">
          <div className="flex items-center gap-2 sm:max-w-sm">
            <Input
              type="number" inputMode="decimal" min="0" step="0.01" placeholder="Min" aria-label="Minimum amount"
              value={draft.min} onChange={(e) => set({ min: e.target.value })}
            />
            <span className="text-sm text-muted-foreground">to</span>
            <Input
              type="number" inputMode="decimal" min="0" step="0.01" placeholder="Max" aria-label="Maximum amount"
              value={draft.max} onChange={(e) => set({ max: e.target.value })}
            />
          </div>
        </Field>
        {problem && <p className="text-sm text-destructive" role="alert">{problem}</p>}
        <div className="flex justify-end gap-2">
          {(active > 0 || activeCount(draft, base) > 0) && (
            <Button variant="ghost" onClick={() => apply(initialFilters(base))}><X aria-hidden /> Clear</Button>
          )}
          <Button disabled={!!problem} onClick={() => apply(draft)}><Check aria-hidden /> Apply</Button>
        </div>
      </Card>
    </div>
  )
}
