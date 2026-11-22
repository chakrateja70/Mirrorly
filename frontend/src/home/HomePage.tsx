import {
  ChevronRight, GlassWater, HandCoins, MoonStar, Salad, Smartphone, Sparkles, Sun, Sunrise, Sunset, UtensilsCrossed, Wallet, type LucideIcon,
} from 'lucide-react'
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { thisMonth, type Iou, type Summary } from '../api'
import { useMe, useMoney } from '../auth/useMe'
import CategoryAvatar from '../features/expenses/CategoryAvatar'
import { iso } from '../features/expenses/filters'
import { useSummary } from '../features/expenses/queries'
import { INSIGHT, liters, STOP } from '../health/health'
import { useHealthProfile, useHealthToday } from '../health/queries'
import { clock, hm, since } from '../health/road'
import { byDue, dueText, isOpen, leftCents, totals } from '../ious/ious'
import PersonAvatar from '../ious/PersonAvatar'
import { useIous } from '../ious/queries'
import Orb from './Orb'

const loadChat = () => import('./Chat')
const Chat = lazy(loadChat) // loads when the assistant first opens (or the pointer heads for its button)

type Money = (v: string | number) => string

/** Greeting + a matching sky icon (warm by day, indigo at night) for the hour of the day. */
function greeting(h: number) {
  if (h >= 5 && h < 12) return { text: 'Good morning', Icon: Sunrise, tint: 'from-amber-300 to-orange-400' }
  if (h >= 12 && h < 17) return { text: 'Good afternoon', Icon: Sun, tint: 'from-yellow-300 to-amber-500' }
  if (h >= 17 && h < 21) return { text: 'Good evening', Icon: Sunset, tint: 'from-orange-400 to-rose-500' }
  return { text: h < 5 ? 'Good morning' : 'Good evening', Icon: MoonStar, tint: 'from-indigo-400 to-violet-600' } // night owl hours
}

/** Home: a dashboard of every tracker; the assistant opens from the button in the corner. */
export default function HomePage() {
  // the clock moves on while the app stays open: re-read it every minute (greeting, date, month, next stop)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])
  const hello = greeting(now.getHours())
  const me = useMe().data
  const money = useMoney()
  const summary = useSummary(thisMonth()).data
  const today = iso(now)

  return (
    <div className="grid gap-4">
      <header className="flex items-center gap-3">
        <span className={`grid size-11 flex-none place-items-center rounded-2xl bg-linear-135 ${hello.tint} text-white shadow-md`} aria-hidden>
          <hello.Icon className="size-6" />
        </span>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1 className="text-[clamp(1.4rem,5.5vw,1.9rem)] leading-tight font-semibold tracking-tight">{hello.text}, {me?.name.split(' ')[0]}</h1>
        </div>
      </header>

      <SpentHero summary={summary} money={money} now={now} />
      <div className="grid items-start gap-4 md:grid-cols-2">
        <ExpensesCard summary={summary} money={money} today={today} />
        <IousCard money={money} today={today} />
      </div>
      <HealthSummary today={today} now={now} />
      <AssistantButton />
    </div>
  )
}

/** Brand gradient (same in both themes, white text keeps contrast) with two soft light blooms. */
function SpentHero({ summary, money, now }: { summary?: Summary; money: Money; now: Date }) {
  const budget = summary?.by_category.reduce((s, c) => s + (c.budget ? Number(c.budget) : 0), 0) ?? 0
  const left = budget - Number(summary?.total ?? 0)
  return (
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
      {budget > 0 && (
        <span className="text-sm text-white/85 tabular-nums">{left >= 0 ? `${money(left)} left of ${money(budget)} budget` : `${money(-left)} over the ${money(budget)} budget`}</span>
      )}
      <ChevronRight className="absolute top-1/2 right-4 size-5 -translate-y-1/2 text-white/70 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  )
}

/** A dashboard card: icon + title, an "open" link, and its body. */
function Panel({ Icon, tint, title, to, children }: { Icon: LucideIcon; tint: string; title: string; to: string; children: ReactNode }) {
  return (
    <Card className="gap-3.5 px-4 py-4 sm:px-5">
      <header className="flex items-center gap-2.5">
        <span className={cn('grid size-8 flex-none place-items-center rounded-xl', tint)}><Icon className="size-4" aria-hidden /></span>
        <h2 className="flex-1 font-semibold tracking-tight">{title}</h2>
        <Link to={to} className="flex items-center gap-0.5 rounded-lg px-1.5 py-1 text-sm font-medium text-primary hover:bg-accent" aria-label={`Open ${title}`}>
          Open <ChevronRight className="size-4" aria-hidden />
        </Link>
      </header>
      {children}
    </Card>
  )
}

const Empty = ({ children }: { children: ReactNode }) => <p className="rounded-xl bg-muted/60 px-3 py-3 text-sm text-muted-foreground">{children}</p>
const Placeholder = ({ rows = 3 }: { rows?: number }) => (
  <div className="grid gap-2.5" role="status"><span className="sr-only">Loading</span>{Array.from({ length: rows }, (_, i) => <span key={i} className="skel h-8! rounded-xl" />)}</div>
)

/** Where this month's money went: top categories against their budgets (or their share of the total). */
function ExpensesCard({ summary, money, today }: { summary?: Summary; money: Money; today: string }) {
  const top = summary?.by_category.filter((c) => Number(c.spent) > 0).sort((a, b) => Number(b.spent) - Number(a.spent)).slice(0, 4) ?? []
  const total = Number(summary?.total ?? 0)
  const spentToday = summary?.by_day.find((d) => d.date === today)?.spent
  return (
    <Panel Icon={Wallet} tint="bg-indigo-500/15 text-indigo-600 dark:text-indigo-300" title="Expenses" to="/expenses">
      {!summary ? <Placeholder /> : top.length === 0 ? <Empty>Nothing spent this month yet. Tell the assistant: "Coffee 80".</Empty> : (
        <>
          <ul className="grid gap-3">
            {top.map((c) => {
              const used = c.budget ? (Number(c.spent) / Number(c.budget)) * 100 : (Number(c.spent) / total) * 100
              const over = !!c.budget && used > 100
              return (
                <li key={c.category_id} className="grid gap-1.5">
                  <div className="flex items-center gap-2.5 text-sm">
                    <CategoryAvatar name={c.name} color={c.color} small />
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <strong className="font-semibold tabular-nums">{money(c.spent)}</strong>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted" title={c.budget ? `${Math.round(used)}% of ${money(c.budget)}` : `${Math.round(used)}% of the month`}>
                    <span className="block h-full rounded-full" style={{ width: `${Math.min(used, 100)}%`, background: over ? 'var(--critical)' : c.color }} />
                  </div>
                  {c.budget && <small className={cn('text-xs', over ? 'font-medium text-critical' : 'text-muted-foreground')}>{Math.round(used)}% of the {money(c.budget)} budget</small>}
                </li>
              )
            })}
          </ul>
          <small className="text-xs text-muted-foreground">Today: <span className="font-medium text-foreground tabular-nums">{money(spentToday ?? 0)}</span></small>
        </>
      )}
    </Panel>
  )
}

const TONE = { overdue: 'font-semibold text-critical', soon: 'font-medium text-amber-600 dark:text-amber-400', later: 'text-muted-foreground', none: 'text-muted-foreground' }

/** Money that's out: totals both ways and the next ones due. */
function IousCard({ money, today }: { money: Money; today: string }) {
  const ious = useIous().data
  const open: Iou[] = (ious ?? []).filter(isOpen).sort(byDue)
  const t = totals(ious ?? [], today)
  return (
    <Panel Icon={HandCoins} tint="bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" title="IOUs" to="/ious">
      {!ious ? <Placeholder /> : open.length === 0 ? <Empty>All settled: nobody owes you, and you owe no one.</Empty> : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-emerald-500/10 px-3 py-2">
              <small className="text-xs text-muted-foreground">Owed to you</small>
              <p className="font-semibold text-good tabular-nums">{money(t.owedToYou / 100)}</p>
            </div>
            <div className="rounded-xl bg-muted/70 px-3 py-2">
              <small className="text-xs text-muted-foreground">You owe</small>
              <p className="font-semibold tabular-nums">{money(t.youOwe / 100)}</p>
            </div>
          </div>
          <ul className="grid gap-2">
            {open.slice(0, 3).map((i) => {
              const due = dueText(i, today)
              return (
                <li key={i.id} className="flex items-center gap-2.5">
                  <PersonAvatar name={i.person} small />
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate text-sm font-medium">{i.direction === 'lent' ? `${i.person} owes you` : `You owe ${i.person}`}</span>
                    <small className={cn('truncate text-xs', TONE[due.tone])}>{due.text}</small>
                  </span>
                  <strong className="text-sm font-semibold tabular-nums">{money(leftCents(i) / 100)}</strong>
                </li>
              )
            })}
          </ul>
          {open.length > 3 && <small className="text-xs text-muted-foreground">+{open.length - 3} more</small>}
        </>
      )}
    </Panel>
  )
}

function Stat({ Icon, label, value, sub, warn }: { Icon: LucideIcon; label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="grid gap-0.5 rounded-xl bg-muted/60 px-3 py-2.5">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="size-3.5" aria-hidden /> {label}</span>
      <strong className={cn('font-semibold tabular-nums', warn && 'text-amber-600 dark:text-amber-400')}>{value}</strong>
      {sub && <small className="text-[0.7rem] text-muted-foreground">{sub}</small>}
    </div>
  )
}

/** Today in Food & Health: last night's sleep, screen time, water, meals, the next stop and the top coach note. */
function HealthSummary({ today, now }: { today: string; now: Date }) {
  const profile = useHealthProfile()
  const has = !!profile.data
  const view = useHealthToday(today, has).data
  const day = view?.log
  const panel = (body: ReactNode) => <Panel Icon={Salad} tint="bg-lime-500/15 text-lime-700 dark:text-lime-300" title="Food & Health" to="/health">{body}</Panel>

  if (profile.isPending) return panel(<Placeholder rows={2} />)
  if (!has) {
    return panel(
      <Link to="/health" className="group flex items-center gap-3 rounded-xl bg-linear-135 from-emerald-500/12 to-teal-500/12 px-3.5 py-3 transition-colors hover:from-emerald-500/20 hover:to-teal-500/20">
        <Sparkles className="size-5 flex-none text-emerald-600 dark:text-emerald-300" aria-hidden />
        <span className="grid flex-1">
          <strong className="text-sm font-semibold">Set up your food & sleep coach</strong>
          <small className="text-xs text-muted-foreground">Two minutes: a daily plan built around your routine and meals.</small>
        </span>
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>,
    )
  }
  if (!view) return panel(<Placeholder rows={2} />)

  const t = view.targets
  const p = profile.data!
  const meals = day?.meals ?? []
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const plan = view.plan
  const next = plan?.stops.find((s) => since(s.time, plan.stops[0].time) > since(hhmm, plan.stops[0].time))
  const note = view.insights.find((i) => i.level === 'warn') ?? view.insights[0]
  return panel(
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat Icon={MoonStar} label="Sleep" value={day?.sleep_minutes != null ? hm(day.sleep_minutes) : '–'} sub={`need ${hm(t.sleep_need)}`} warn={day?.sleep_minutes != null && day.sleep_minutes < t.sleep_need - 60} />
        <Stat Icon={Smartphone} label="Screen time" value={day?.screen_minutes != null ? hm(day.screen_minutes) : '–'} sub={`target ≤ ${hm(t.screen_target)}`} warn={day?.screen_minutes != null && day.screen_minutes > t.screen_target} />
        <Stat Icon={GlassWater} label="Water" value={liters(day?.water_ml ?? 0)} sub={`of ${liters(p.water_goal_ml)}`} />
        <Stat Icon={UtensilsCrossed} label="Meals" value={String(meals.length)} sub={meals.length ? `≈ ${meals.reduce((s, m) => s + m.kcal, 0)} kcal` : 'none logged yet'} />
      </div>
      {next ? (
        <Link to="/health" className="group flex items-center gap-3 rounded-xl bg-muted/60 px-3 py-2.5 transition-colors hover:bg-accent">
          {(() => { const { Icon, tint } = STOP[next.kind]; return <span className={cn('grid size-8 flex-none place-items-center rounded-lg text-white', tint)}><Icon className="size-4" aria-hidden /></span> })()}
          <span className="grid min-w-0 flex-1">
            <span className="truncate text-sm"><span className="text-muted-foreground">Next </span><strong className="font-semibold tabular-nums">{clock(next.time)}</strong> · {next.title}</span>
            {next.foods.length > 0 && <small className="truncate text-xs text-muted-foreground">{next.foods.join(', ')}</small>}
          </span>
          <ChevronRight className="size-4 flex-none text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      ) : !plan && (
        <Link to="/health" className="flex items-center gap-2 justify-self-start rounded-full bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Sparkles className="size-4" aria-hidden /> Make today's plan
        </Link>
      )}
      {note && (() => {
        const { Icon, tone, label } = INSIGHT[note.level]
        return (
          <div className="flex gap-2.5">
            <span className={cn('grid size-7 flex-none place-items-center rounded-lg', tone)}><Icon className="size-3.5" aria-hidden /><span className="sr-only">{label}:</span></span>
            <span className="grid gap-0.5 text-sm"><strong className="font-semibold">{note.title}</strong><span className="line-clamp-2 text-muted-foreground">{note.tip}</span></span>
          </div>
        )
      })()}
    </>,
  )
}

/** The assistant lives behind a button in the corner: a full-screen sheet on phones, a panel on wider screens. */
function AssistantButton() {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          aria-label="Ask Mirrorly, your assistant" onPointerEnter={loadChat} onFocus={loadChat}
          className="group fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-[15] flex items-center gap-2 rounded-full bg-card p-1 shadow-xl shadow-violet-500/25 ring-1 ring-black/5 transition-transform hover:-translate-y-0.5 motion-reduce:transition-none lg:right-8 lg:bottom-8 lg:pr-4"
        >
          <Orb className="size-13" />
          <span className="hidden text-sm font-semibold lg:inline">Ask Mirrorly</span>
        </button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false} aria-describedby={undefined}
        // a voice recording takes Escape to cancel itself; everywhere else Escape closes the assistant
        onEscapeKeyDown={(e) => { if ((e.target as HTMLElement).closest('[aria-label="Recording a voice message"]')) e.preventDefault() }}
        className={cn(
          'inset-0 top-0 left-0 flex h-dvh max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none bg-transparent p-0 shadow-none sm:max-w-none',
          'sm:inset-auto sm:top-auto sm:right-6 sm:bottom-6 sm:left-auto sm:h-[min(46rem,calc(100dvh-3rem))] sm:w-[26rem] sm:origin-bottom-right',
        )}
      >
        <DialogTitle className="sr-only">Ask Mirrorly</DialogTitle>
        <Suspense fallback={<div className="grid flex-1 place-items-center bg-card sm:rounded-2xl" role="status"><Orb className="size-14 animate-pulse" /><span className="sr-only">Opening the assistant</span></div>}>
          <Chat
            onClose={() => setOpen(false)}
            className="rounded-none pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] sm:rounded-2xl sm:py-0 sm:shadow-2xl"
          />
        </Suspense>
      </DialogContent>
    </Dialog>
  )
}
