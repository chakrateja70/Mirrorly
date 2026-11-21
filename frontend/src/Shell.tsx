import { House, LogOut, Menu, Wallet, X } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, NavLink, Outlet } from 'react-router-dom'
import { api } from './api'
import { useMe } from './auth/useMe'
import ThemeToggle from './ThemeToggle'

const SECTIONS = [
  { to: '/', label: 'Home', Icon: House, end: true },
  { to: '/expenses', label: 'Expenses', Icon: Wallet, end: false },
  // future trackers (food, wardrobe, ...) get an entry here
]

export default function Shell() {
  const me = useMe()
  const [navOpen, setNavOpen] = useState(false) // mobile drawer; the sidebar is always shown on wide screens

  if (me.isPending) return <div className="splash"><img className="pulse" src="/brand-mark.png" alt="Loading" width={72} height={72} /></div>
  if (me.isError) return <div className="splash error">{me.error.message} <button onClick={() => me.refetch()}>Retry</button></div>
  if (!me.data) return <Navigate to="/login" replace />

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {})
    location.assign('/login') // full reload: drops every cached query of the previous user
  }

  return (
    <div className={`app${navOpen ? ' nav-open' : ''}`} onKeyDown={(e) => e.key === 'Escape' && setNavOpen(false)}>
      <aside className="sidebar">
        <div className="brand">
          <img src="/brand-mark.png" alt="" width={32} height={32} />
          <span>Mirrorly</span>
          <button className="ghost icon-btn close-nav" aria-label="Close menu" onClick={() => setNavOpen(false)}>
            <X size={20} aria-hidden />
          </button>
        </div>
        <nav className="side-nav" aria-label="Sections">
          {SECTIONS.map(({ to, label, Icon, end }) => (
            <NavLink key={to} to={to} end={end} onClick={() => setNavOpen(false)}>
              <Icon size={18} aria-hidden /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <ThemeToggle />
          <div className="me">
            <span className="avatar" aria-hidden>{me.data.name.charAt(0).toUpperCase()}</span>
            <span className="grow">
              <strong>{me.data.name}</strong>
              <small className="muted">{me.data.email}</small>
            </span>
            <button className="ghost icon-btn" aria-label="Log out" title="Log out" onClick={logout}>
              <LogOut size={18} aria-hidden />
            </button>
          </div>
        </div>
      </aside>
      <div className="backdrop" onClick={() => setNavOpen(false)} />

      <div className="main">
        <header className="topbar">
          <button className="ghost icon-btn" aria-label="Open menu" aria-expanded={navOpen} onClick={() => setNavOpen(true)}>
            <Menu size={22} aria-hidden />
          </button>
          <strong>Mirrorly</strong>
          <Link to="/" className="topbar-logo" aria-label="Mirrorly home">
            <img src="/brand-mark.png" alt="" width={34} height={34} />
          </Link>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
