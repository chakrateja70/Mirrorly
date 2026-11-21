import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AuthPage from './auth/AuthPage'
import CategoriesPage from './features/expenses/CategoriesPage'
import ExpensesLayout from './features/expenses/ExpensesLayout'
import TransactionsPage from './features/expenses/TransactionsPage'
import HomePage from './home/HomePage'
import Shell from './Shell'

const AnalyticsPage = lazy(() => import('./features/expenses/AnalyticsPage')) // keeps recharts out of first load

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route element={<Shell />}>
          <Route index element={<HomePage />} />
          <Route path="expenses" element={<ExpensesLayout />}>
            <Route index element={<TransactionsPage />} />
            <Route path="analytics" element={<Suspense fallback={<p className="muted">Loading charts…</p>}><AnalyticsPage /></Suspense>} />
            <Route path="categories" element={<CategoriesPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
