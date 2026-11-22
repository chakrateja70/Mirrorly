import { ChevronRight, MoonStar, Sun, Sunrise, Sunset } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { thisMonth } from '../api'
import { useMe, useMoney } from '../auth/useMe'
import { useSummary } from '../features/expenses/queries'
import Chat from './Chat'

/** Greeting + a matching sky icon (warm by day, indigo at night) for the hour of the day. */
function greeting(h: number) {
  if (h >= 5 && h < 12) return { text: 'Good morning', Icon: Sunrise, tint: 'from-amber-300 to-orange-400' }
  if (h >= 12 && h < 17) return { text: 'Good afternoon', Icon: Sun, tint: 'from-yellow-300 to-amber-500' }
  if (h >= 17 && h < 21) return { text: 'Good evening', Icon: Sunset, tint: 'from-orange-400 to-rose-500' }
  return { text: h < 5 ? 'Good morning' : 'Good evening', Icon: MoonStar, tint: 'from-indigo-400 to-violet-600' } // night owl hours
}

export default function HomePage() {
  // the clock moves on while the app stays open: re-read it every minute (greeting, date, month)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])
  const hello = greeting(now.getHours())
  const me = useMe().data
  const money = useMoney()
  const summary = useSummary(thisMonth()).data

  return (
    <div className="home flex min-h-0 flex-1 flex-col gap-4">
      <header className="flex items-center gap-3">
        <span className={`grid size-11 flex-none place-items-center rounded-2xl bg-linear-135 ${hello.tint} text-white shadow-md`} aria-hidden>
          <hello.Icon className="size-6" />
        </span>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1 className="text-[clamp(1.4rem,5.5vw,1.9rem)] leading-tight font-semibold tracking-tight">{hello.text}, {me?.name.split(' ')[0]}</h1>
        </div>
      </header>

      {/* brand gradient (same in both themes, white text keeps contrast) with two soft light blooms */}
      <Link
        to="/expenses" aria-label="Spent this month, see details"
        className="group relative isolate grid gap-1 overflow-hidden rounded-2xl bg-linear-135 from-indigo-600 via-violet-600 to-fuchsia-600 py-5 pr-12 pl-5 text-white shadow-xl shadow-indigo-500/25 transition-transform hover:-translate-y-0.5 motion-reduce:transition-none"
      >
        <span className="absolute -top-16 -right-10 -z-10 size-48 rounded-full bg-white/15 blur-2xl" aria-hidden />
        <span className="absolute -bottom-20 left-1/3 -z-10 size-40 rounded-full bg-fuchsia-300/20 blur-2xl" aria-hidden />
        <span className="text-sm font-medium text-white/80">Spent in {now.toLocaleDateString(undefined, { month: 'long' })}</span>
        <strong className="hero-figure text-[clamp(2.1rem,9vw,2.8rem)] leading-[1.05] font-bold tracking-tight tabular-nums">
          {summary ? money(summary.total) : <span className="skel animate-pulse bg-white/25 bg-none" style={{ width: '7ch', height: '1.05em', margin: 0 }} />}
        </strong>
        <ChevronRight className="absolute top-1/2 right-4 size-5 -translate-y-1/2 text-white/70 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>

      <Chat />
    </div>
  )
}
