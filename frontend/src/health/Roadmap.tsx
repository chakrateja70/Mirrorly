import { CarFront, Check, type LucideIcon } from 'lucide-react'
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { layoutRoad, type RoadLayout } from './road'

export type RoadStop = {
  key: string
  label: string // "1:30 PM", "Week 2"
  sub?: string // "Meal", "22–28 Nov"
  title: string
  Icon: LucideIcon
  tint: string // pin and badge color, e.g. "bg-emerald-500"
  state: 'done' | 'current' | 'upcoming'
  sky: string // the backdrop behind this stop (a CSS color; light-dark() for both themes)
  night?: boolean // stars behind it
  Scenery?: LucideIcon // decoration in the free space beside the card (wide screens)
  children?: ReactNode // card body
}
type Sign = { Icon: LucideIcon; text: string }
type Geo = RoadLayout & { width: number; sky: string; starsTop: number | null }

/**
 * The day as a drive: a winding road (red-and-white kerbs, dashed centre line) across a sky that changes with the
 * time of each stop, sunrise to starry night. Cards alternate sides; the road runs beside each and swings across in
 * the gaps; the travelled part glows in the brand gradient. Where scroll-driven animations are supported (and motion
 * is welcome) the road draws itself and a car drives it as you scroll; elsewhere the finished road is simply there.
 * Geometry comes from the cards' real sizes (road.ts).
 */
export default function Roadmap({ stops, label, start, finish, banner }: { stops: RoadStop[]; label: string; start?: Sign; finish?: Sign; banner?: ReactNode }) {
  const scene = useRef<HTMLDivElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLOListElement>(null)
  const [geo, setGeo] = useState<Geo | null>(null)
  const id = useId().replace(/[^\w-]/g, '')
  const current = stops.findIndex((s) => s.state === 'current')
  const reached = current >= 0 ? current : stops.findLastIndex((s) => s.state === 'done')

  useLayoutEffect(() => {
    const el = list.current
    if (!el || !wrap.current || !scene.current) return
    const measure = () => {
      const items = [...el.querySelectorAll<HTMLElement>(':scope > li')]
      if (!items.length) return
      const lane = parseFloat(getComputedStyle(items[0]).paddingLeft) // the free lane beside each card holds the road
      const road = layoutRoad(items.map((li) => ({ top: li.offsetTop, height: li.offsetHeight })), el.clientWidth, lane, reached, el.scrollHeight)
      // the sky: each stop's color at its pin, blending in between (scene coordinates)
      const off = wrap.current!.offsetTop
      const ys = road.pins.map((p) => Math.round(p.y + off))
      const sky = `linear-gradient(to bottom, ${stops[0].sky} 0px, ${stops.map((s, i) => `${s.sky} ${ys[i]}px`).join(', ')}, ${stops[stops.length - 1].sky} 100%)`
      const firstNight = stops.findIndex((s) => s.night)
      const starsTop = firstNight < 0 ? null : firstNight === 0 ? 0 : Math.round((ys[firstNight - 1] + ys[firstNight]) / 2)
      setGeo({ ...road, width: el.clientWidth, sky, starsTop })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(scene.current)
    return () => ro.disconnect()
  }, [stops, reached])

  return (
    <div ref={scene} className="road-scene relative isolate overflow-clip rounded-[1.75rem] shadow-card" style={{ background: geo?.sky ?? stops[0]?.sky }}>
      {geo?.starsTop != null && <div className="road-stars pointer-events-none absolute inset-x-0 bottom-0" style={{ top: geo.starsTop }} aria-hidden />}
      {!stops[0]?.night && <div className="pointer-events-none absolute -top-16 -right-14 size-52 rounded-full bg-amber-300/45 blur-3xl dark:bg-amber-400/15" aria-hidden />}
      {banner && (
        <div className="pointer-events-none sticky top-[calc(7.5rem+env(safe-area-inset-top))] z-30 flex justify-center px-3 pt-3 lg:top-4">
          <div className="pointer-events-auto max-w-full rounded-full bg-card/90 px-3.5 py-1.5 text-xs font-medium shadow-lg backdrop-blur sm:text-sm">{banner}</div>
        </div>
      )}
      {start && <Signboard sign={start} className="pt-4" />}

      <div ref={wrap} className="road-wrap relative isolate">
        {geo && (
          <svg className="road pointer-events-none absolute inset-0" width={geo.width} height={geo.height} viewBox={`0 0 ${geo.width} ${geo.height}`} aria-hidden>
            <defs>
              <linearGradient id={`${id}g`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={geo.height}>
                <stop offset="0" stopColor="#f59e0b" /><stop offset="0.35" stopColor="#8b5cf6" /><stop offset="1" stopColor="#d946ef" />
              </linearGradient>
              <mask id={`${id}m`} maskUnits="userSpaceOnUse" x="0" y="0" width={geo.width} height={geo.height}>
                <path className="road-reveal" d={geo.road} pathLength={1} stroke="white" strokeWidth={46} />
              </mask>
            </defs>
            <g mask={`url(#${id}m)`}>
              <path className="road-kerb-base" d={geo.road} />
              <path className="road-kerb" d={geo.road} />
              <path className="road-asphalt" d={geo.road} />
              {geo.travelled && <path className="road-travelled" d={geo.travelled} stroke={`url(#${id}g)`} />}
              <path className="road-dash" d={geo.road} />
              {geo.travelled && <path className="road-flow" d={geo.travelled} />}
            </g>
          </svg>
        )}

        <ol ref={list} aria-label={label} className="relative grid gap-14 pt-6 pb-14">
          {stops.map((s, i) => {
            const scenery = (
              <span className="hidden min-w-0 flex-1 items-center justify-center sm:flex" aria-hidden>
                {s.Scenery && <s.Scenery className={cn('size-14', s.night ? 'text-white/55' : 'text-slate-700/30 dark:text-white/35')} strokeWidth={1.25} />}
              </span>
            )
            return (
              <li
                key={s.key} data-road-current={s.state === 'current' || undefined}
                className={cn('flex [--lane:clamp(3.75rem,16%,6.5rem)]', i % 2 ? 'justify-end pr-(--lane) pl-0' : 'justify-start pl-(--lane) pr-0')}
              >
                {i % 2 === 1 && scenery}
                <div className={cn('road-card relative z-10 w-full max-w-[26rem] flex-none rounded-[1.15rem] sm:w-[26rem]', s.state === 'current' ? 'road-now p-[2px] shadow-xl shadow-violet-500/30' : 'shadow-card')}>
                  <div className="grid gap-1.5 rounded-2xl bg-card px-4 py-3 text-card-foreground">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={cn('grid size-6 flex-none place-items-center rounded-lg text-white', s.tint)}><s.Icon className="size-3.5" aria-hidden /></span>
                      <span className="flex-none text-base font-bold tracking-tight whitespace-nowrap tabular-nums">{s.label}</span>
                      {s.sub && <span className="truncate text-xs text-muted-foreground">{s.sub}</span>}
                      {s.state === 'current' && <span className="ml-auto flex-none rounded-full bg-primary px-2 py-0.5 text-[0.7rem] font-semibold text-primary-foreground">You are here</span>}
                      {s.state === 'done' && <span className="ml-auto flex flex-none items-center gap-1 text-xs font-medium text-good"><Check className="size-3.5" aria-hidden /> Done</span>}
                    </div>
                    <strong className="text-[0.98rem] leading-snug font-semibold">{s.title}</strong>
                    {s.children}
                  </div>
                </div>
                {i % 2 === 0 && scenery}
              </li>
            )
          })}
        </ol>

        <div className="pointer-events-none absolute inset-0" aria-hidden>
          {geo?.pins.map((p, i) => {
            const s = stops[i]
            return (
              <span
                key={s.key} style={{ left: p.x, top: p.y }}
                className={cn(
                  'road-pin absolute z-10 grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full ring-4 ring-white/90 dark:ring-zinc-900/90',
                  s.state !== 'upcoming' ? `${s.tint} text-white shadow-lg` : 'bg-card text-muted-foreground shadow-md',
                )}
              >
                {s.state === 'current' && <span className={cn('absolute inset-0 -z-10 animate-ping rounded-full opacity-60 motion-reduce:animate-none', s.tint)} />}
                {s.state === 'done' ? <Check className="size-5" strokeWidth={3} /> : <s.Icon className="size-5" />}
              </span>
            )
          })}
          {geo && <span className="road-car" style={{ offsetPath: `path("${geo.road}")` }}><CarFront className="size-5" /></span>}
        </div>
      </div>

      {finish && (
        <div className="relative z-20 grid justify-items-center gap-3 pb-5">
          <div className="road-finish h-4 w-full" aria-hidden />
          <Signboard sign={finish} />
        </div>
      )}
    </div>
  )
}

function Signboard({ sign, className }: { sign: Sign; className?: string }) {
  return (
    <div className={cn('relative z-20 flex justify-center', className)}>
      <span className="flex items-center gap-2 rounded-full bg-card/95 px-4 py-1.5 text-sm font-semibold shadow-lg backdrop-blur">
        <sign.Icon className="size-4 text-amber-500" aria-hidden /> {sign.text}
      </span>
    </div>
  )
}
