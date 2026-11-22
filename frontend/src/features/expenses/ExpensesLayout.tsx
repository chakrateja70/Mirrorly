import { ChartPie, List, Tags } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { BASE, initialFilters, type FiltersCtx } from './filters'

const TABS = [
  { to: '/expenses', end: true, Icon: List, label: 'Transactions' },
  { to: '/expenses/analytics', end: false, Icon: ChartPie, label: 'Analytics' },
  { to: '/expenses/categories', end: false, Icon: Tags, label: 'Categories', wide: ' & budgets' },
]

/** Expense tracker section: its views as a segmented control; each of Transactions / Analytics keeps its own filters. */
export default function ExpensesLayout() {
  const [all, setAll] = useState(() => ({ transactions: initialFilters(BASE.transactions), analytics: initialFilters(BASE.analytics) }))
  return (
    <section>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Expenses</h1>
      {/* phones: pinned under the topbar (3.5rem tall) while the page scrolls; three equal segments, nothing to swipe */}
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-[9] -mx-4 mb-5 bg-background/75 px-4 py-2 backdrop-blur-xl lg:static lg:mx-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <nav className="flex w-full rounded-xl bg-muted p-1 sm:w-fit" aria-label="Expense views">
          {TABS.map(({ to, end, Icon, label, wide }) => (
            <NavLink
              key={to} to={to} end={end}
              className={({ isActive }) => cn(
                'flex h-9 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground sm:flex-none sm:px-4',
                isActive && 'bg-card text-foreground shadow-sm',
              )}
            >
              <Icon className="hidden size-4 sm:block" aria-hidden />
              <span>{label}{wide && <span className="hidden sm:inline">{wide}</span>}</span>
            </NavLink>
          ))}
        </nav>
      </div>
      <Outlet context={{ all, setAll } satisfies FiltersCtx} />
    </section>
  )
}
