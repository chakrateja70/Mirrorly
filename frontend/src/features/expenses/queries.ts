import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query'
import { api, queryClient, type Category, type Expense, type ExpensePage, type Summary } from '../../api'
import { pageQuery, type Filters } from './filters'

export const useCategories = () =>
  useQuery({ queryKey: ['categories'], queryFn: () => api<Category[]>('/categories') })

/** All expenses in [start, end]. Keeps the previous range on screen while a new one loads (no flash). */
export const useExpenses = (start: string, end: string) =>
  useQuery({
    queryKey: ['expenses', start, end],
    queryFn: () => api<Expense[]>(`/expenses?start=${start}&end=${end}`),
    placeholderData: keepPreviousData,
  })

// Under ['expenses'], so refreshExpenseData covers it. staleTime lets a prefetched page show without a second fetch.
const pageOptions = (f: Filters, page: number) => queryOptions({
  queryKey: ['expenses', 'page', f, page],
  queryFn: () => api<ExpensePage>(`/expenses/page?${pageQuery(f, page)}`),
  staleTime: 30_000,
})

/** One page of the Transactions list. Keeps the previous page on screen while the next loads (no flash). */
export const useExpensePage = (f: Filters, page: number) => useQuery({ ...pageOptions(f, page), placeholderData: keepPreviousData })
export const prefetchExpensePage = (f: Filters, page: number) => queryClient.prefetchQuery(pageOptions(f, page))

export const useSummary =(month: string) =>
  useQuery({ queryKey: ['summary', month], queryFn: () => api<Summary>(`/expenses/summary?month=${month}`) })

/** Anything that changes expenses or budgets invalidates all derived views. */
export const refreshExpenseData = () =>
  Promise.all(['expenses', 'summary', 'categories'].map((k) => queryClient.invalidateQueries({ queryKey: [k] })))
