import { ChevronDown, type LucideIcon } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { LEVELS } from './health'

/** Marks a required field: a red star, read as "(required)". */
export const Req = () => <><span className="text-destructive" aria-hidden> *</span><span className="sr-only"> (required)</span></>

/**
 * A section that folds away: icon, title and a one-line summary of what's inside, so a closed fold still tells you
 * where you stand. Native <details>: keyboard and screen readers work out of the box. Pass `open` to control it.
 */
export function Fold({ id, Icon, tint, title, summary, open, onOpenChange, aside, children }: {
  id?: string; Icon: LucideIcon; tint: string; title: ReactNode; summary?: ReactNode; open?: boolean
  onOpenChange?: (open: boolean) => void; aside?: ReactNode; children: ReactNode
}) {
  return (
    <details id={id} open={open} onToggle={(e) => onOpenChange?.(e.currentTarget.open)} className="group scroll-mt-36 rounded-2xl bg-card text-card-foreground shadow-card">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-3 select-none transition-colors hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
        <span className={cn('grid size-10 flex-none place-items-center rounded-xl', tint)}><Icon className="size-5" aria-hidden /></span>
        <span className="grid min-w-0 flex-1">
          <span className="font-semibold tracking-tight">{title}</span>
          {summary && <span className="truncate text-sm text-muted-foreground">{summary}</span>}
        </span>
        {aside}
        <ChevronDown className="size-5 flex-none text-muted-foreground transition-transform duration-200 group-open:rotate-180" aria-hidden />
      </summary>
      <div className="grid gap-4 px-4 pt-1 pb-4">{children}</div>
    </details>
  )
}

/** A progress ring: how far today's value is toward its target. Over a "stay under" target, it turns red. */
export function Ring({ label, value, max, display, sub, color, over, onClick }: {
  label: string; value: number; max: number; display: string; sub: string; color: string; over?: boolean; onClick?: () => void
}) {
  const r = 26, c = 2 * Math.PI * r
  const pct = max > 0 ? Math.min(value / max, 1) : 0
  return (
    <button
      type="button" onClick={onClick} aria-label={`${label}: ${display}, ${sub}. Show details`}
      className="grid min-w-0 justify-items-center gap-1 rounded-2xl px-1 py-2 transition-colors hover:bg-muted/60"
    >
      <span className="relative grid size-[4.25rem] place-items-center">
        <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90" aria-hidden>
          <circle cx="32" cy="32" r={r} fill="none" stroke="var(--muted)" strokeWidth="7" />
          <circle
            cx="32" cy="32" r={r} fill="none" stroke={over ? 'var(--critical)' : color} strokeWidth="7" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - pct)} className="transition-[stroke-dashoffset] duration-700 motion-reduce:transition-none"
          />
        </svg>
        <span className={cn('font-semibold tracking-tight tabular-nums', display.length > 5 ? 'text-[0.7rem]' : 'text-[0.82rem]', over && 'text-critical')}>{display}</span>
      </span>
      <span className="text-xs font-medium">{label}</span>
      <small className="max-w-full truncate text-[0.68rem] text-muted-foreground">{sub}</small>
    </button>
  )
}

/** Five rising bars, the first `level` lit: a level you can read at a glance. */
const Bars = ({ level, color, lit }: { level: number; color: string; lit: boolean }) => (
  <span className="flex h-4 items-end gap-[2px]" aria-hidden>
    {[1, 2, 3, 4, 5].map((b) => (
      <span key={b} className="w-[3px] rounded-full" style={{ height: `${b * 20}%`, background: b <= level && lit ? color : 'color-mix(in oklab, var(--muted-foreground) 30%, transparent)' }} />
    ))}
  </span>
)

/** Pick a level from Poor to Great (sleep quality, energy). */
export function LevelPicker({ label, value, onPick, Icon }: { label: string; value: number | null; onPick: (v: number) => void; Icon?: LucideIcon }) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 flex items-center gap-2 text-sm font-medium">{Icon && <Icon className="size-4 text-muted-foreground" aria-hidden />}{label}</legend>
      <div className="grid grid-cols-5 gap-1.5">
        {LEVELS.map((l, i) => {
          const on = value === i + 1
          return (
            <button
              key={l.label} type="button" aria-pressed={on} onClick={() => onPick(i + 1)}
              className={cn('grid justify-items-center gap-1.5 rounded-xl bg-muted px-1 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground', on && 'bg-card text-foreground shadow-card ring-2')}
              style={on ? { '--tw-ring-color': l.color } as CSSProperties : undefined}
            >
              <Bars level={i + 1} color={l.color} lit={on || value === null} />
              {l.label}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
