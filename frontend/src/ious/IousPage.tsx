import { useMutation } from '@tanstack/react-query'
import { ArrowDownLeft, ArrowUpRight, BellRing, CalendarDays, CheckCheck, HandCoins, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar-lazy'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { api, today, type Iou } from '../api'
import { useMoney } from '../auth/useMe'
import { iso, parseDay } from '../features/expenses/filters'
import { SkeletonList } from '../Skeleton'
import { byDue, dueText, isOpen, leftCents, reminderText, totals, type Tone } from './ious'
import PersonAvatar from './PersonAvatar'
import { refreshIous, useIous } from './queries'

const TONE: Record<Tone, string> = {
  overdue: 'font-semibold text-critical', soon: 'font-medium text-amber-600 dark:text-amber-400', later: 'text-muted-foreground', none: 'text-muted-foreground',
}
const shortDay = (s: string) => parseDay(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const addDays = (s: string, n: number) => { const d = parseDay(s); d.setDate(d.getDate() + n); return iso(d) }

/** Phones: the share sheet (WhatsApp, SMS, ...). Desktop: WhatsApp with the message ready to send. */
async function sendReminder(text: string) {
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ text })
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return // the user closed the sheet
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
}

function DatePick({ value, onPick, label }: { value: string; onPick: (d: string) => void; label: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="secondary" className="w-full justify-start bg-muted font-normal" aria-label={label}>
          <CalendarDays aria-hidden /> {shortDay(value)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" required autoFocus selected={parseDay(value)} defaultMonth={parseDay(value)} onSelect={(d) => { onPick(iso(d)); setOpen(false) }} />
      </PopoverContent>
    </Popover>
  )
}

const QUICK_DUE: [string, number][] = [['3 days', 3], ['1 week', 7], ['2 weeks', 14], ['1 month', 30]]
const pill = 'h-9 rounded-full bg-muted px-3.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground'

/** Add or edit an IOU. `iou: null` = add. */
function IouForm({ iou, onClose }: { iou: Iou | null; onClose: () => void }) {
  const [d, setD] = useState({
    direction: iou?.direction ?? 'lent', person: iou?.person ?? '', amount: iou?.amount ?? '', repaid: iou?.repaid ?? '0',
    given_on: iou?.given_on ?? today(), due_on: iou?.due_on ?? null, note: iou?.note ?? '',
  })
  const set = (patch: Partial<typeof d>) => setD({ ...d, ...patch })
  const [pickDue, setPickDue] = useState(false)

  const save = useMutation({
    mutationFn: () => {
      const body = { ...d, person: d.person.trim(), note: d.note.trim(), repaid: d.repaid || '0' }
      return iou ? api(`/ious/${iou.id}`, { method: 'PATCH', body }) : api('/ious', { method: 'POST', body: { ...body, repaid: undefined } })
    },
    onSuccess: async () => { await refreshIous(); onClose() },
  })
  const remove = useMutation({
    mutationFn: () => api(`/ious/${iou!.id}`, { method: 'DELETE' }),
    onSuccess: async () => { await refreshIous(); onClose() },
  })
  const error = save.error ?? remove.error
  const lent = d.direction === 'lent'

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
          <DialogHeader>
            <DialogTitle>{iou ? 'Edit IOU' : 'New IOU'}</DialogTitle>
            <DialogDescription>Money you lent or borrowed. It doesn't count as spending.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" role="group" aria-label="Direction">
            {([['lent', 'I lent', 'they owe me', ArrowUpRight], ['borrowed', 'I borrowed', 'I owe them', ArrowDownLeft]] as const).map(([value, title, sub, Icon]) => (
              <button
                key={value} type="button" aria-pressed={d.direction === value} onClick={() => set({ direction: value })}
                className="grid justify-items-center gap-0.5 rounded-lg py-2 text-sm font-medium text-muted-foreground transition-colors aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-sm"
              >
                <span className="flex items-center gap-1.5"><Icon className="size-4" aria-hidden /> {title}</span>
                <small className="text-xs font-normal text-muted-foreground">{sub}</small>
              </button>
            ))}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="person">{lent ? 'Who did you lend to?' : 'Who lent you money?'}</Label>
            <Input id="person" required maxLength={100} autoFocus={!iou} value={d.person} onChange={(e) => set({ person: e.target.value })} placeholder="Name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="iou-amount">Amount</Label>
              <Input
                id="iou-amount" type="number" inputMode="decimal" step="0.01" min="0.01" required placeholder="0.00"
                className="text-lg font-semibold tabular-nums" value={d.amount} onChange={(e) => set({ amount: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <span className="text-sm font-medium">{lent ? 'Given on' : 'Got it on'}</span>
              <DatePick value={d.given_on} label="Date given" onPick={(given_on) => set({ given_on, due_on: d.due_on && d.due_on < given_on ? null : d.due_on })} />
            </div>
          </div>
          {iou && (
            <div className="grid gap-2">
              <Label htmlFor="repaid">Paid back so far</Label>
              <Input
                id="repaid" type="number" inputMode="decimal" step="0.01" min="0" max={d.amount || undefined} className="tabular-nums"
                value={d.repaid} onChange={(e) => set({ repaid: e.target.value })}
              />
            </div>
          )}
          <div className="grid gap-2">
            <span className="text-sm font-medium" id="due-label">{lent ? 'They return it by' : 'Pay back by'}</span>
            <div className="flex flex-wrap gap-2" role="group" aria-labelledby="due-label">
              <button type="button" className={pill} aria-pressed={d.due_on === null} onClick={() => set({ due_on: null })}>No date</button>
              {QUICK_DUE.map(([label, n]) => (
                <button key={label} type="button" className={pill} aria-pressed={d.due_on === addDays(d.given_on, n)} onClick={() => set({ due_on: addDays(d.given_on, n) })}>
                  {label}
                </button>
              ))}
              <Popover open={pickDue} onOpenChange={setPickDue}>
                <PopoverTrigger asChild>
                  <button
                    type="button" className={cn(pill, 'inline-flex items-center gap-1.5')}
                    aria-pressed={d.due_on !== null && !QUICK_DUE.some(([, n]) => d.due_on === addDays(d.given_on, n))}
                  >
                    <CalendarDays className="size-4" aria-hidden />
                    {d.due_on && !QUICK_DUE.some(([, n]) => d.due_on === addDays(d.given_on, n)) ? shortDay(d.due_on) : 'Pick'}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single" required autoFocus selected={d.due_on ? parseDay(d.due_on) : undefined} defaultMonth={parseDay(d.due_on ?? d.given_on)}
                    disabled={{ before: parseDay(d.given_on) }} onSelect={(day) => { set({ due_on: iso(day) }); setPickDue(false) }}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="iou-note">Note</Label>
            <Input id="iou-note" maxLength={500} value={d.note} onChange={(e) => set({ note: e.target.value })} placeholder="Optional, e.g. Movie tickets" />
          </div>
          {error && <p className="text-sm text-destructive" role="alert">{error.message}</p>}
          <DialogFooter className="flex-row gap-2">
            {iou && (
              <Button
                type="button" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={remove.isPending}
                onClick={() => confirm(`Delete this IOU with ${iou.person}?`) && remove.mutate()}
              >
                <Trash2 aria-hidden /> Delete
              </Button>
            )}
            <span className="flex-1" />
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function IouRow({ iou, onEdit, onSettle, settling }: { iou: Iou; onEdit: () => void; onSettle: () => void; settling: boolean }) {
  const money = useMoney()
  const open = isOpen(iou)
  const due = dueText(iou, today())
  const partly = open && leftCents(iou) < Math.round(Number(iou.amount) * 100)
  const actionPill = 'h-8 gap-1.5 rounded-full px-3 text-xs [&_svg:not([class*=size-])]:size-3.5'
  return (
    <li className={cn('flex gap-3 px-4 py-3', !open && 'opacity-70')}>
      <PersonAvatar name={iou.person} />
      <div className="grid min-w-0 flex-1 gap-2">
        {/* the text gets the full width; actions sit underneath so nothing important is cut off on a phone */}
        <button className="flex items-start justify-between gap-3 text-left" onClick={onEdit}>
          <span className="grid min-w-0">
            <span className="truncate font-medium">
              {iou.direction === 'lent'
                ? open ? `${iou.person} owes you` : `${iou.person} paid you back`
                : open ? `You owe ${iou.person}` : `You paid ${iou.person} back`}
            </span>
            <small className={cn('truncate text-xs', open ? TONE[due.tone] : 'text-muted-foreground')}>
              {open ? due.text : `Settled · ${shortDay(iou.given_on)}`}{iou.note && ` · ${iou.note}`}
            </small>
          </span>
          <span className="grid flex-none justify-items-end">
            <strong className={cn('font-semibold tabular-nums', open && iou.direction === 'lent' && 'text-good')}>
              {money(open ? leftCents(iou) / 100 : iou.amount)}
            </strong>
            {partly && <small className="text-xs text-muted-foreground tabular-nums">of {money(iou.amount)}</small>}
          </span>
        </button>
        {partly && (
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="meter" aria-label="Paid back" aria-valuemin={0} aria-valuemax={100}
            aria-valuenow={Math.round((Number(iou.repaid) / Number(iou.amount)) * 100)}>
            <span className="block h-full rounded-full bg-good" style={{ width: `${(Number(iou.repaid) / Number(iou.amount)) * 100}%` }} />
          </div>
        )}
        {open && (
          <div className="flex flex-wrap gap-2">
            {iou.direction === 'lent' && (
              <Button variant="secondary" size="sm" className={cn(actionPill, 'text-primary')} aria-label={`Remind ${iou.person}`} onClick={() => sendReminder(reminderText(iou, money))}>
                <BellRing aria-hidden /> Remind
              </Button>
            )}
            <Button variant="secondary" size="sm" className={cn(actionPill, 'text-good')} aria-label={`Paid back, ${iou.person}`} disabled={settling} onClick={onSettle}>
              <CheckCheck aria-hidden /> Paid back
            </Button>
          </div>
        )}
      </div>
    </li>
  )
}

/** Money lent and borrowed: what's still out, what's due, and a one-tap reminder for friends who owe you. */
export default function IousPage() {
  const ious = useIous()
  const money = useMoney()
  const [editing, setEditing] = useState<Iou | null | undefined>(undefined) // undefined = closed, null = adding
  const settle = useMutation({
    mutationFn: (iou: Iou) => api(`/ious/${iou.id}`, { method: 'PATCH', body: { repaid: iou.amount } }),
    onSuccess: refreshIous,
  })
  const all = ious.data ?? []
  const open = all.filter(isOpen).sort(byDue)
  const settled = all.filter((i) => !isOpen(i))
  const t = totals(all, today())
  const count = (dir: Iou['direction']) => open.filter((i) => i.direction === dir).length

  return (
    <section className="grid gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">IOUs</h1>
        <p className="text-sm text-muted-foreground">Money you lent or borrowed. It doesn't count as spending.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="gap-1 p-4">
          <span className="mb-2 grid size-9 place-items-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"><ArrowDownLeft className="size-[1.125rem]" aria-hidden /></span>
          <span className="text-sm text-muted-foreground">Owed to you</span>
          <strong className="truncate text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">{money(t.owedToYou / 100)}</strong>
          <small className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {count('lent')} {count('lent') === 1 ? 'person' : 'people'}
            {t.overdue > 0 && <Badge variant="destructive" className="h-5 px-1.5">{t.overdue} overdue</Badge>}
          </small>
        </Card>
        <Card className="gap-1 p-4">
          <span className="mb-2 grid size-9 place-items-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400"><ArrowUpRight className="size-[1.125rem]" aria-hidden /></span>
          <span className="text-sm text-muted-foreground">You owe</span>
          <strong className="truncate text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">{money(t.youOwe / 100)}</strong>
          <small className="text-xs text-muted-foreground">{count('borrowed')} {count('borrowed') === 1 ? 'person' : 'people'}</small>
        </Card>
      </div>

      {ious.error && <p className="text-destructive">{ious.error.message}</p>}
      {/* the "all square" welcome is only for an empty history; settled IOUs show in their own list below */}
      {ious.isPending ? <SkeletonList label="Loading IOUs" rows={4} /> : all.length === 0 ? (
        <Card className="items-center gap-3 px-6 py-10 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground"><HandCoins aria-hidden /></span>
          <p className="font-medium">All square: nobody owes anybody</p>
          <p className="max-w-xs text-sm text-muted-foreground">Tap + to add one, or tell the assistant: "I gave 500 to Rahul, he'll return it in 5 days".</p>
        </Card>
      ) : open.length > 0 && (
        <Card className="gap-0 overflow-hidden py-1">
          <ul className="divide-y divide-border/60">
            {open.map((i) => (
              <IouRow key={i.id} iou={i} onEdit={() => setEditing(i)} onSettle={() => settle.mutate(i)} settling={settle.isPending && settle.variables?.id === i.id} />
            ))}
          </ul>
        </Card>
      )}
      {settle.error && <p className="text-sm text-destructive">{settle.error.message}</p>}

      {settled.length > 0 && (
        <details className="group" open={open.length === 0}>
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">Settled ({settled.length})</summary>
          <Card className="mt-3 gap-0 overflow-hidden py-1">
            <ul className="divide-y divide-border/60">
              {settled.map((i) => <IouRow key={i.id} iou={i} onEdit={() => setEditing(i)} onSettle={() => {}} settling={false} />)}
            </ul>
          </Card>
        </details>
      )}

      <Button
        className="fab fixed right-5 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-[5] size-14 rounded-full bg-linear-135 from-indigo-500 to-violet-600 text-white shadow-xl shadow-indigo-500/30 hover:brightness-110 [&_svg:not([class*='size-'])]:size-6"
        aria-label="Add IOU" title="Add IOU" onClick={() => setEditing(null)}
      >
        <Plus aria-hidden />
      </Button>
      {editing !== undefined && <IouForm iou={editing} onClose={() => setEditing(undefined)} />}
    </section>
  )
}
