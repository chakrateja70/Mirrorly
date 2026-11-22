import { useMutation } from '@tanstack/react-query'
import { BedDouble, Check, Flag, Flame, Footprints, Milestone, Mountain, MountainSnow, RotateCcw, Smartphone, Sparkles, Trees, Trophy, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { api, today, type JourneyWeek } from '../api'
import { parseDay } from '../features/expenses/filters'
import { SkeletonList } from '../Skeleton'
import { refreshHealth, useHealthToday } from './queries'
import { clock, hm } from './road'
import Roadmap, { type RoadStop } from './Roadmap'

// six weeks from the valley to the summit: a sky that brightens week by week (light and dark steps)
const WEEK_SKY = ['light-dark(#d9f7e6, #10261b)', 'light-dark(#cdf3ec, #10282a)', 'light-dark(#d4ecff, #142640)', 'light-dark(#dfe2ff, #1b2045)', 'light-dark(#ece2ff, #241c46)', 'light-dark(#fde7f3, #34183a)']
const WEEK_SCENERY = [Trees, Trees, Mountain, Mountain, MountainSnow, MountainSnow]

const span = (w: JourneyWeek) => {
  const f = (s: string) => parseDay(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  return `${f(w.start)} – ${f(w.end)}`
}

/** One target of a week: the goal, and (once the week has started) how you're doing against it. */
function Target({ Icon, goal, actual, met, started }: { Icon: LucideIcon; goal: string; actual: string | null; met: boolean; started: boolean }) {
  return (
    <li className={cn('flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs', started && met ? 'bg-emerald-500/12' : 'bg-muted')}>
      <Icon className="size-3.5 flex-none text-muted-foreground" aria-hidden />
      <span className="flex-1 font-medium">{goal}</span>
      {started && (actual !== null
        ? <span className={cn('tabular-nums', met ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground')}>{met && <Check className="mr-0.5 inline size-3" aria-hidden />}you: {actual}</span>
        : <span className="text-muted-foreground">no logs yet</span>)}
    </li>
  )
}

/** Six weeks of gradual targets (computed by the app), each named with tips by the coach, as a road. */
export default function JourneyPage() {
  const view = useHealthToday(today())
  const start = useMutation({
    mutationFn: () => api('/wellness/journey', { method: 'POST', body: { day: today() } }),
    onSuccess: () => refreshHealth(),
  })
  const journey = view.data?.journey

  if (view.isPending) return <SkeletonList label="Loading your journey" rows={4} />
  if (view.isError) return <p className="text-destructive" role="alert">{view.error.message}</p>
  if (!journey || start.isPending) {
    return (
      <Card className="mx-auto max-w-2xl gap-3 px-5 py-6">
        <h2 className="text-lg font-semibold tracking-tight">Your journey</h2>
        <p className="text-sm text-muted-foreground">
          {start.isPending ? 'Mapping out the next six weeks…' : 'Six weeks of small, steady steps from where you are now: earlier nights, less screen time, more movement, lighter food. Each week has clear targets, and your logs show how you\'re doing.'}
        </p>
        {start.error && <p className="text-sm text-destructive" role="alert">{start.error.message}</p>}
        <Button size="lg" className="justify-self-start" disabled={start.isPending} onClick={() => start.mutate()}>
          <Sparkles className={cn(start.isPending && 'animate-pulse')} aria-hidden /> {start.isPending ? 'Planning…' : 'Start my journey'}
        </Button>
      </Card>
    )
  }

  const stops: RoadStop[] = journey.weeks.map((w) => {
    const started = w.status !== 'upcoming'
    const a = w.actual
    return {
      key: String(w.week), label: `Week ${w.week}`, sub: span(w), title: w.title, Icon: Milestone, tint: 'bg-violet-500',
      state: w.status === 'current' ? 'current' : w.status,
      sky: WEEK_SKY[(w.week - 1) % WEEK_SKY.length], Scenery: WEEK_SCENERY[(w.week - 1) % WEEK_SCENERY.length],
      children: (
        <>
          <ul className="grid gap-1">
            <Target Icon={BedDouble} goal={`Bed by ${clock(w.bedtime)}`} actual={a.bedtime && clock(a.bedtime)} met={w.met.bedtime} started={started} />
            <Target Icon={Smartphone} goal={`Screen ≤ ${hm(w.screen_minutes)} a day`} actual={a.screen_minutes !== null ? hm(a.screen_minutes) : null} met={w.met.screen_minutes} started={started} />
            <Target Icon={Footprints} goal={`Move ${w.exercise_minutes} min a day`} actual={a.exercise_minutes !== null ? `${a.exercise_minutes} min` : null} met={w.met.exercise_minutes} started={started} />
            <Target Icon={Flame} goal={`Heavy food ≤ ${w.heavy_days} day${w.heavy_days === 1 ? '' : 's'}`} actual={a.heavy_days !== null ? `${a.heavy_days}` : null} met={w.met.heavy_days} started={started} />
          </ul>
          {w.tips.length > 0 && (
            <details open={w.status === 'current'} className="group text-sm">
              <summary className="cursor-pointer text-xs font-medium text-primary">How to get there</summary>
              <ul className="mt-1.5 grid list-disc gap-1 pl-4 text-muted-foreground">{w.tips.map((t) => <li key={t}>{t}</li>)}</ul>
            </details>
          )}
        </>
      ),
    }
  })

  return (
    <section className="mx-auto grid max-w-3xl gap-4" aria-label="Your journey">
      <header className="flex flex-wrap items-start gap-3">
        <div className="grid min-w-0 flex-1 gap-0.5">
          <h2 className="text-lg font-semibold tracking-tight">{journey.headline || 'Your journey'}</h2>
          <p className="text-sm text-muted-foreground">Small weekly steps, measured from your check-ins.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => confirm('Start a new journey from today? Targets restart from your latest numbers.') && start.mutate()}>
          <RotateCcw aria-hidden /> Start over
        </Button>
      </header>
      {start.error && <p className="text-sm text-destructive" role="alert">{start.error.message}</p>}
      <Roadmap
        stops={stops} label="Journey weeks" start={{ Icon: Flag, text: `Start · ${span(journey.weeks[0]).split(' – ')[0]}` }}
        finish={{ Icon: Trophy, text: `Summit · week ${journey.weeks.length}` }}
      />
    </section>
  )
}
