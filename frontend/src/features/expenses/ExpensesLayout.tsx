import { ChartPie, List, Tags } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { initialFilters, type FiltersCtx } from './filters'

/** Expense tracker section: its views as tabs, filters shared between Transactions and Analytics. */
export default function ExpensesLayout() {
  const [filters, setFilters] = useState(initialFilters)
  return (
    <section>
      <h1 className="page-title">Expenses</h1>
      <nav className="tabs" aria-label="Expense views">
        <NavLink to="/expenses" end><List size={16} aria-hidden /> Transactions</NavLink>
        <NavLink to="/expenses/analytics"><ChartPie size={16} aria-hidden /> Analytics</NavLink>
        <NavLink to="/expenses/categories"><Tags size={16} aria-hidden /> Categories<span className="wide-only">&nbsp;&amp; budgets</span></NavLink>
      </nav>
      <Outlet context={{ filters, setFilters } satisfies FiltersCtx} />
    </section>
  )
}
