import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api, queryClient, type Category, type Expense, type Summary } from '../../api'

export const useCategories = () =>
  useQuery({ queryKey: ['categories'], queryFn: () => api<Category[]>('/categories') })

/** All expenses in [start, end]. Keeps the previous range on screen while a new one loads (no flash). */
export const useExpenses = (start: string, end: string) =>
  useQuery({
    queryKey: ['expenses', start, end],
    queryFn: () => api<Expense[]>(`/expenses?start=${start}&end=${end}`),
    placeholderData: keepPreviousData,
  })

export const useSummary = (month: string) =>
  useQuery({ queryKey: ['summary', month], queryFn: () => api<Summary>(`/expenses/summary?month=${month}`) })

/** Anything that changes expenses or budgets invalidates all derived views. */
export const refreshExpenseData = () =>
  Promise.all(['expenses', 'summary', 'categories'].map((k) => queryClient.invalidateQueries({ queryKey: [k] })))
