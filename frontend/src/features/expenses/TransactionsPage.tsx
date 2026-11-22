import { ChevronLeft, ChevronRight, Plus, ReceiptText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem } from '@/components/ui/pagination'
import { sumMoney, type Expense } from '../../api'
import { useMoney } from '../../auth/useMe'
import { SkeletonList } from '../../Skeleton'
import CategoryAvatar from './CategoryAvatar'
import ExpenseForm from './ExpenseForm'
import FilterBar from './FilterBar'
import { PAGE_SIZE, pageNumbers, useFilters } from './filters'
import { prefetchExpensePage, useCategories, useExpensePage } from './queries'

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

export default function TransactionsPage() {
  const { filters, setFilters, base } = useFilters('transactions')
  const money = useMoney()
  // a page belongs to the filters it was picked under: new filters start again at page 1
  const [paging, setPaging] = useState({ page: 0, filters })
  const page = paging.filters === filters ? paging.page : 0
  const res = useExpensePage(filters, page)
  const categories = useCategories()
  // undefined = closed, null = adding, Expense = editing
  const [editing, setEditing] = useState<Expense | null | undefined>(undefined)

  const data = res.data
  const pages = Math.max(1, Math.ceil((data?.count ?? 0) / PAGE_SIZE))
  const settled = !!data && !res.isPlaceholderData // data is for this exact page, not the previous one
  useEffect(() => {
    if (settled && page + 1 < pages) prefetchExpensePage(filters, page + 1) // so "Next" is instant
  }, [settled, filters, page, pages])
  if (settled && page >= pages) setPaging({ page: pages - 1, filters }) // e.g. deleted the last row of the last page

  const goTo = (p: number) => {
    setPaging({ page: p, filters })
    window.scrollTo({ top: 0 })
  }
  const catById = new Map(categories.data?.map((c) => [c.id, c]))
  const dayTotal = new Map(data?.days.map((d) => [d.date, d.spent]))
  const byDay = Map.groupBy(data?.items ?? [], (e) => e.spent_on) // API returns newest first
  const narrowed = filters.categories.length + filters.methods.length > 0 || !!filters.min.trim() || !!filters.max.trim()

  return (
    <>
      <FilterBar filters={filters} setFilters={setFilters} categories={categories.data ?? []} base={base} />

      {res.isPending ? <SkeletonList label="Loading expenses" /> : data && (
        <p className="mb-5 flex items-baseline gap-2">
          <strong className="text-3xl font-semibold tracking-tight tabular-nums">{money(data.total)}</strong>
          <span className="text-muted-foreground">{data.count} expense{data.count === 1 ? '' : 's'}</span>
        </p>
      )}
      {res.error && <p className="text-destructive">{res.error.message}</p>}
      {data?.count === 0 && (
        <Card className="items-center gap-3 px-6 py-12 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground"><ReceiptText aria-hidden /></span>
          <p className="text-muted-foreground">
            {narrowed ? 'No expenses match these filters.' : filters.period === 'today' ? 'Nothing spent today yet. Tap + to add one.' : 'No expenses in this period. Tap + to add one.'}
          </p>
        </Card>
      )}

      <div className={res.isPlaceholderData ? 'stale' : undefined}>
        {[...byDay].map(([day, items]) => (
          <div key={day} className="day mb-5">
            <h3 className="mb-2 flex justify-between px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <span>{dayLabel(day)}</span>
              <span className="tabular-nums">{money(dayTotal.get(day) ?? sumMoney(items.map((e) => e.amount)))}</span>
            </h3>
            <Card className="gap-0 overflow-hidden py-1">
              <ul className="divide-y divide-border/60">
                {items.map((e) => {
                  const cat = catById.get(e.category_id)
                  return (
                    <li key={e.id}>
                      <button className="item flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none" onClick={() => setEditing(e)}>
                        <CategoryAvatar cat={cat} />
                        <span className="grid min-w-0 flex-1">
                          <span className="truncate font-medium">{e.note || cat?.name || '—'}</span>
                          <small className="truncate text-xs text-muted-foreground">{[e.note && cat?.name, e.payment_method.toUpperCase()].filter(Boolean).join(' · ')}</small>
                        </span>
                        <strong className="font-semibold tabular-nums">{money(e.amount)}</strong>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </Card>
          </div>
        ))}
      </div>

      {pages > 1 && (
        <Pagination className="mt-6">
          <PaginationContent>
            <PaginationItem>
              <Button variant="ghost" size="icon" aria-label="Previous page" disabled={page === 0} onClick={() => goTo(page - 1)}><ChevronLeft aria-hidden /></Button>
            </PaginationItem>
            {pageNumbers(page, pages).map((p, i) => p === null
              ? <PaginationItem key={`gap${i}`}><PaginationEllipsis /></PaginationItem>
              : (
                <PaginationItem key={p}>
                  <Button
                    variant={p === page ? 'default' : 'ghost'} size="icon" className="tabular-nums"
                    aria-label={`Page ${p + 1}`} aria-current={p === page ? 'page' : undefined} onClick={() => goTo(p)}
                  >
                    {p + 1}
                  </Button>
                </PaginationItem>
              ))}
            <PaginationItem>
              <Button variant="ghost" size="icon" aria-label="Next page" disabled={page + 1 >= pages} onClick={() => goTo(page + 1)}><ChevronRight aria-hidden /></Button>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      <Button
        className="fab fixed right-5 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-[5] size-14 rounded-full bg-linear-135 from-indigo-500 to-violet-600 text-white shadow-xl shadow-indigo-500/30 hover:brightness-110 [&_svg:not([class*='size-'])]:size-6"
        aria-label="Add expense" title="Add expense" onClick={() => setEditing(null)} disabled={!categories.data}
      >
        <Plus aria-hidden />
      </Button>
      {editing !== undefined && categories.data && (
        <ExpenseForm expense={editing} categories={categories.data} onClose={() => setEditing(undefined)} />
      )}
    </>
  )
}
