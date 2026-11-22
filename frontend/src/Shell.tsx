import { HandCoins, House, LogOut, Menu, Wallet, X } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, NavLink, Outlet } from 'react-router-dom'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { api, forgetUser } from './api'
import { useMe } from './auth/useMe'
import ThemeToggle from './ThemeToggle'

const SECTIONS = [
  { to: '/', label: 'Home', Icon: House, end: true },
  { to: '/expenses', label: 'Expenses', Icon: Wallet, end: false },
  { to: '/ious', label: 'IOUs', Icon: HandCoins, end: false },
  // future trackers (food, wardrobe, ...) get an entry here
]

export default function Shell() {
  const me = useMe()
  const [navOpen, setNavOpen] = useState(false) // mobile drawer; the sidebar is always shown on wide screens
  const [loggingOut, setLoggingOut] = useState(false)

  if (me.isPending) return <div className="grid min-h-dvh place-items-center"><img className="animate-pulse" src="/brand-mark.png" alt="Loading" width={72} height={72} /></div>
  if (me.isError) {
    return (
      <div className="grid min-h-dvh place-content-center justify-items-center gap-3 text-destructive">
        {me.error.message} <Button variant="secondary" onClick={() => me.refetch()}>Retry</Button>
      </div>
    )
  }
  if (!me.data) return <Navigate to="/login" replace />

  const logout = async () => {
    setLoggingOut(true)
    await api('/auth/logout', { method: 'POST' }).catch(() => {})
    forgetUser() // also wipes the saved copy, so the next open doesn't paint this user's data
    location.assign('/login') // full reload: drops everything else in memory
  }

  return (
    // Escape closes the drawer, but not when it comes from a popup portaled out of it (e.g. the logout dialog)
    <div onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.contains(e.target as Node) && setNavOpen(false)}>
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 flex w-[min(15.5rem,85vw)] flex-col gap-6 bg-card px-3 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-card',
          'transition-[translate,visibility] duration-200 motion-reduce:transition-none lg:visible lg:translate-x-0 lg:transition-none',
          navOpen ? 'visible translate-x-0' : 'invisible -translate-x-full', // hidden drawer is out of the tab order
        )}
      >
        <div className="flex items-center gap-1 px-1">
          <Link
            to="/" onClick={() => setNavOpen(false)} aria-label="Mirrorly home"
            className="flex items-center gap-2.5 rounded-lg p-1 text-lg font-bold tracking-tight transition-opacity hover:opacity-80"
          >
            <img src="/brand-mark.png" alt="" width={32} height={32} />
            <span>Mirrorly</span>
          </Link>
          <Button variant="ghost" size="icon" className="ml-auto lg:hidden" aria-label="Close menu" onClick={() => setNavOpen(false)}>
            <X aria-hidden />
          </Button>
        </div>
        <nav className="grid gap-1" aria-label="Sections">
          {SECTIONS.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to} to={to} end={end} onClick={() => setNavOpen(false)}
              className={({ isActive }) => cn(
                'flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                isActive && 'bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <Icon className="size-[1.125rem]" aria-hidden /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto grid gap-3">
          <ThemeToggle />
          <div className="flex items-center gap-2.5 rounded-xl bg-muted/60 p-2">
            <span className="grid size-9 flex-none place-items-center rounded-full bg-linear-135 from-indigo-500 to-fuchsia-500 text-sm font-bold text-white" aria-hidden>
              {me.data.name.charAt(0).toUpperCase()}
            </span>
            <span className="grid min-w-0 flex-1 leading-tight">
              <strong className="truncate text-sm">{me.data.name}</strong>
              <small className="truncate text-xs text-muted-foreground">{me.data.email}</small>
            </span>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Log out" title="Log out"><LogOut aria-hidden /></Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader className="items-center sm:items-start">
                  <span className="mb-1 grid size-12 place-items-center rounded-2xl bg-destructive/10 text-destructive"><LogOut aria-hidden /></span>
                  <AlertDialogTitle>Log out of Mirrorly?</AlertDialogTitle>
                  <AlertDialogDescription>You'll need to log in again to see your expenses. Everything you've saved stays safe.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={loggingOut}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className={buttonVariants({ variant: 'destructive' })} disabled={loggingOut}
                    onClick={(e) => { e.preventDefault(); logout() }} // stay open (showing progress) until the page reloads
                  >
                    {loggingOut ? 'Logging out…' : 'Log out'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </aside>
      <div className={cn('fixed inset-0 z-20 bg-black/40 backdrop-blur-sm lg:hidden', navOpen ? 'block' : 'hidden')} onClick={() => setNavOpen(false)} />

      <div className="main lg:ml-[15.5rem]">
        <header className="sticky top-0 z-10 bg-background/75 px-2 pt-[env(safe-area-inset-top)] backdrop-blur-xl lg:hidden">
          <div className="flex h-14 items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Open menu" aria-expanded={navOpen} onClick={() => setNavOpen(true)}>
              <Menu className="size-5" aria-hidden />
            </Button>
            <Link to="/" className="rounded-lg px-1 font-semibold tracking-tight transition-opacity hover:opacity-80">Mirrorly</Link>
            <Link to="/" className="ml-auto grid size-11 place-items-center rounded-xl" aria-label="Mirrorly home">
              <img src="/brand-mark.png" alt="" width={32} height={32} />
            </Link>
          </div>
        </header>
        <main className="content mx-auto max-w-[70rem] px-4 pt-5 pb-24 lg:px-8 lg:pt-8 lg:pb-16">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
