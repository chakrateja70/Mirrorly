import { ChevronRight, HandCoins, MoonStar, Sun, Sunrise, Sunset } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { thisMonth } from '../api'
import { useMe, useMoney } from '../auth/useMe'
import { iso } from '../features/expenses/filters'
import { useSummary } from '../features/expenses/queries'
import { totals } from '../ious/ious'
import { useIous } from '../ious/queries'
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
  const owed = totals(useIous().data ?? [], iso(now)) // the strip only shows while money is out

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

      {(owed.owedToYou > 0 || owed.youOwe > 0) && (
        <Link to="/ious" className="group flex items-center gap-3 rounded-2xl bg-card px-4 py-2.5 shadow-card transition-colors hover:bg-accent/50">
          <span className="relative grid size-9 flex-none place-items-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <HandCoins className="size-[1.125rem]" aria-hidden />
            {owed.overdue > 0 && <span className="absolute -top-0.5 -right-0.5 size-2.5 animate-pulse rounded-full bg-critical ring-2 ring-card" aria-hidden />}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm">
            {owed.owedToYou > 0 && <><strong className="font-semibold tabular-nums">{money(owed.owedToYou / 100)}</strong> owed to you</>}
            {owed.owedToYou > 0 && owed.youOwe > 0 && <span className="text-muted-foreground"> · </span>}
            {owed.youOwe > 0 && <>you owe <strong className="font-semibold tabular-nums">{money(owed.youOwe / 100)}</strong></>}
            {owed.overdue > 0 && <span className="font-medium text-critical"> · {owed.overdue} overdue</span>}
          </span>
          <ChevronRight className="size-4 flex-none text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      )}

      <Chat />
    </div>
  )
}
