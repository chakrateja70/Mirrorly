import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { thisMonth } from '../api'
import { useMe, useMoney } from '../auth/useMe'
import { useSummary } from '../features/expenses/queries'
import Chat from './Chat'

function greeting(h: number) {
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export default function HomePage() {
  const [now] = useState(() => new Date()) // read the clock once per visit, not on every render
  const me = useMe().data
  const money = useMoney()
  const summary = useSummary(thisMonth()).data

  return (
    <div className="home">
      <header className="hello">
        <p className="muted">{now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <h1>{greeting(now.getHours())}, {me?.name.split(' ')[0]}</h1>
      </header>

      <Link to="/expenses" className="card hero" aria-label="Spent this month, see details">
        <span className="muted">Spent in {now.toLocaleDateString(undefined, { month: 'long' })}</span>
        <strong className="hero-figure">{summary ? money(summary.total) : '…'}</strong>
        <ChevronRight className="hero-chevron" size={20} aria-hidden />
      </Link>

      <Chat />
    </div>
  )
}
