import { ChartLine, Flame, GlassWater, MoonStar, Smartphone } from 'lucide-react'
import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card } from '@/components/ui/card'
import { today, type HealthDay, type HealthProfile } from '../api'
import { ChartCard, Kpi } from '../features/expenses/AnalyticsPage'
import { TICK, TOOLTIP } from '../features/expenses/chartStyle'
import { parseDay } from '../features/expenses/filters'
import { ChartsSkeleton } from '../Skeleton'
import { addDays, liters, pill } from './health'
import { useHealthDays, useHealthToday } from './queries'
import { hm } from './road'

const HEAVY = ['fried', 'heavy']
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const AXIS = { tick: TICK, tickLine: false, axisLine: { stroke: 'var(--border)' }, minTickGap: 12 } as const
const GOAL_LINE = { stroke: 'var(--muted-foreground)', strokeDasharray: '4 4', ifOverflow: 'extendDomain' } as const

/** Every day in the range (gaps stay gaps), with the numbers each chart needs. */
function series(days: HealthDay[], start: string, n: number) {
  const byDay = new Map(days.map((d) => [d.day, d]))
  return Array.from({ length: n }, (_, i) => {
    const day = addDays(start, i)
    const d = byDay.get(day)
    const heavy = d?.meals.filter((m) => m.items.some((it) => it.tags.some((t) => HEAVY.includes(t)))).length ?? 0
    return {
      day, label: parseDay(day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
      sleep: d?.sleep_minutes != null ? d.sleep_minutes / 60 : null,
      screen: d?.screen_minutes != null ? d.screen_minutes / 60 : null,
      exercise: d?.exercise_minutes ?? null,
      water: d?.water_ml ?? null,
      heavy: d?.meals.length ? heavy : null,
      light: d?.meals.length ? d.meals.length - heavy : null,
    }
  })
}

/** Sleep, screen time, food and movement over the last 2 or 4 weeks, against your targets. */
export default function TrendsPage() {
  const profile = useOutletContext<HealthProfile>()
  const [n, setN] = useState(14)
  const end = today()
  const start = addDays(end, -(n - 1))
  const days = useHealthDays(start, end)
  const need = useHealthToday(end).data?.targets.sleep_need ?? 480

  const picker = (
    <div className="flex gap-2" role="group" aria-label="Range">
      {[14, 30].map((x) => <button key={x} className={pill} aria-pressed={n === x} onClick={() => setN(x)}>Last {x} days</button>)}
    </div>
  )
  if (days.isPending) return <div className="grid gap-4">{picker}<ChartsSkeleton /></div>
  if (days.isError) return <p className="text-destructive" role="alert">{days.error.message}</p>

  const rows = series(days.data, start, n)
  const pick = (k: 'sleep' | 'screen' | 'exercise' | 'water') => rows.map((r) => r[k]).filter((v): v is number => v !== null)
  const sleepAvg = avg(pick('sleep')), screenAvg = avg(pick('screen')), waterAvg = avg(pick('water'))
  const heavyDays = rows.filter((r) => r.heavy).length
  const tooltip = (fmt: (v: number) => string) => ({ ...TOOLTIP, cursor: { fill: 'var(--muted)' }, formatter: (v: unknown) => fmt(Number(v)) })

  if (!days.data.length) {
    return (
      <div className="grid gap-4">
        {picker}
        <Card className="items-center gap-3 px-6 py-12 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground"><ChartLine aria-hidden /></span>
          <p className="text-muted-foreground">Log a few check-ins and meals on Today, and your trends show up here.</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      {picker}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi Icon={MoonStar} label="Average sleep" value={sleepAvg !== null ? hm(sleepAvg * 60) : '–'} note={`need ${hm(need)}`} />
        <Kpi Icon={Smartphone} label="Average screen time" value={screenAvg !== null ? hm(screenAvg * 60) : '–'} note={`goal ${hm(profile.screen_goal_minutes)}`} />
        <Kpi Icon={Flame} label="Days with heavy food" value={String(heavyDays)} note={`of ${rows.filter((r) => r.heavy !== null).length} days with meals logged`} />
        <Kpi Icon={GlassWater} label="Average water" value={waterAvg !== null ? liters(Math.round(waterAvg)) : '–'} note={`goal ${liters(profile.water_goal_ml)}`} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard title="Sleep" table={rows.filter((r) => r.sleep !== null).map((r) => [r.label, hm(r.sleep! * 60)])}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis dataKey="label" {...AXIS} />
              <YAxis tick={TICK} tickLine={false} axisLine={false} width={36} tickFormatter={(v) => `${v}h`} />
              <Tooltip {...tooltip((v) => hm(v * 60))} />
              <ReferenceLine y={need / 60} {...GOAL_LINE} label={{ value: `need ${hm(need)}`, position: 'insideTopRight', fill: 'var(--muted-foreground)', fontSize: 11 }} />
              <Bar dataKey="sleep" name="Slept" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Screen time (outside work)" table={rows.filter((r) => r.screen !== null).map((r) => [r.label, hm(r.screen! * 60)])}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis dataKey="label" {...AXIS} />
              <YAxis tick={TICK} tickLine={false} axisLine={false} width={36} tickFormatter={(v) => `${v}h`} />
              <Tooltip {...tooltip((v) => hm(v * 60))} />
              <ReferenceLine y={profile.screen_goal_minutes / 60} {...GOAL_LINE} label={{ value: `goal ${hm(profile.screen_goal_minutes)}`, position: 'insideTopRight', fill: 'var(--muted-foreground)', fontSize: 11 }} />
              <Bar dataKey="screen" name="Screen time" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Meals: heavy or fried vs the rest" table={rows.filter((r) => r.heavy !== null).map((r) => [r.label, `${r.heavy} heavy · ${r.light} other`])}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis dataKey="label" {...AXIS} />
              <YAxis tick={TICK} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
              <Tooltip {...tooltip((v) => `${v} meal${v === 1 ? '' : 's'}`)} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: 'var(--muted-foreground)' }} />
              {/* a 2px surface gap separates the stacked segments */}
              <Bar dataKey="heavy" name="Heavy or fried" stackId="m" fill="var(--series-4)" stroke="var(--card)" strokeWidth={2} maxBarSize={28} />
              <Bar dataKey="light" name="Other meals" stackId="m" fill="var(--series-3)" stroke="var(--card)" strokeWidth={2} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Exercise (minutes)" table={rows.filter((r) => r.exercise !== null).map((r) => [r.label, `${r.exercise} min`])}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis dataKey="label" {...AXIS} />
              <YAxis tick={TICK} tickLine={false} axisLine={false} width={36} />
              <Tooltip {...tooltip((v) => `${v} min`)} />
              <ReferenceLine y={30} {...GOAL_LINE} label={{ value: '30 min', position: 'insideTopRight', fill: 'var(--muted-foreground)', fontSize: 11 }} />
              <Bar dataKey="exercise" name="Exercise" fill="var(--series-3)" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  )
}
