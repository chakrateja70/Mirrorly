import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AuthPage from './auth/AuthPage'
import CategoriesPage from './features/expenses/CategoriesPage'
import ExpensesLayout from './features/expenses/ExpensesLayout'
import TransactionsPage from './features/expenses/TransactionsPage'
import HomePage from './home/HomePage'
import IousPage from './ious/IousPage'
import Shell from './Shell'
import { ChartsSkeleton, SkeletonList } from './Skeleton'

const AnalyticsPage = lazy(() => import('./features/expenses/AnalyticsPage')) // keeps recharts out of first load
// Food & Health loads on first visit
const HealthLayout = lazy(() => import('./health/HealthLayout'))
const TodayPage = lazy(() => import('./health/TodayPage'))
const JourneyPage = lazy(() => import('./health/JourneyPage'))
const ProfilePage = lazy(() => import('./health/ProfilePage'))
const TrendsPage = lazy(() => import('./health/TrendsPage'))
const page = (el: ReactNode) => <Suspense fallback={<SkeletonList label="Loading" rows={4} />}>{el}</Suspense>

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route element={<Shell />}>
          <Route index element={<HomePage />} />
          <Route path="ious" element={<IousPage />} />
          <Route path="health" element={page(<HealthLayout />)}>
            <Route index element={page(<TodayPage />)} />
            <Route path="journey" element={page(<JourneyPage />)} />
            <Route path="trends" element={<Suspense fallback={<ChartsSkeleton />}><TrendsPage /></Suspense>} />
            <Route path="profile" element={page(<ProfilePage />)} />
          </Route>
          <Route path="expenses" element={<ExpensesLayout />}>
            <Route index element={<TransactionsPage />} />
            <Route path="analytics" element={<Suspense fallback={<ChartsSkeleton />}><AnalyticsPage /></Suspense>} />
            <Route path="categories" element={<CategoriesPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
