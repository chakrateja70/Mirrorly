import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowUp, Bot, RotateCcw, TriangleAlert, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, METHOD_COLOR, queryClient, today, type Answer, type Category, type ChatMessage, type Iou, type PaymentMethod } from '../api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useMe, useMoney } from '../auth/useMe'
import { Loading } from '../Skeleton'
import { refreshExpenseData, useCategories } from '../features/expenses/queries'
import CategoryAvatar from '../features/expenses/CategoryAvatar'
import { dueText, isOpen, leftCents } from '../ious/ious'
import PersonAvatar from '../ious/PersonAvatar'
import { refreshIous } from '../ious/queries'

/** The assistant's face: a glossy gradient orb that slowly turns (still when reduced motion is on). */
const Orb = ({ className }: { className?: string }) => (
  <span className={cn('relative isolate grid place-items-center overflow-hidden rounded-full shadow-lg shadow-violet-500/30', className)} aria-hidden>
    <span className="absolute -inset-1/4 -z-10 animate-[spin_7s_linear_infinite] bg-[conic-gradient(#6366f1,#a855f7,#ec4899,#22d3ee,#6366f1)] motion-reduce:animate-none" />
    <span className="absolute inset-x-[18%] top-[8%] -z-10 h-[38%] rounded-full bg-white/35 blur-[3px]" />
    <Bot className="size-[52%] text-white drop-shadow-[0_1px_2px_rgb(0_0_0/0.35)]" />
  </span>
)

/** Chat bubble: mine on the right in the brand color, the assistant's on the left. */
const bubble = (role: ChatMessage['role']) => cn(
  'max-w-[min(88%,560px)] rounded-2xl px-3.5 py-2.5 wrap-anywhere',
  role === 'user' ? 'self-end rounded-br-md bg-primary text-primary-foreground' : 'self-start rounded-bl-md bg-card text-card-foreground shadow-card',
)

const SUGGESTIONS = [
  'I purchased a soap of cost 20 rupees',
  'How much did I spend on food this month?',
  'I gave 500 to Rahul, he will return it in 5 days',
]

type Money = (v: string | number) => string

const shortDate = (iso: string) => new Date(`${iso}T00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

const UNDO_SECONDS = 60
type Item = ChatMessage & { undoUntil: number } // device-clock deadline for undoing what this message logged

/** Pin undo deadlines to this device's clock from the server-measured age (immune to a wrong device clock). */
function stamp(msgs: ChatMessage[]): Item[] {
  const received = Date.now()
  return msgs.map((m) => ({ ...m, undoUntil: received + (UNDO_SECONDS - m.age) * 1000 }))
}

function groupName(a: Answer, g: Answer['groups'][number]) {
  if (a.group_by === 'month') return new Date(`${g.key}-01T00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
  if (a.group_by === 'day') return shortDate(g.key)
  if (a.group_by === 'payment_method') return g.name.toUpperCase()
  return g.name
}

/** Figures for a spending question: computed by the backend in SQL, never by the model. */
function AnswerCard({ a, catById, money }: { a: Answer; catById: Map<string, Category>; money: Money }) {
  const total = Number(a.total)
  const color = (key: string) =>
    a.group_by === 'category' ? catById.get(key)?.color ?? 'var(--fold)'
      : a.group_by === 'payment_method' ? METHOD_COLOR[key as PaymentMethod] ?? 'var(--fold)'
        : 'var(--series-1)'
  const used = a.budget ? (total / Number(a.budget)) * 100 : 0
  return (
    <div className="mt-2.5 grid min-w-[min(300px,70vw)] gap-1 rounded-xl bg-card p-3.5 text-card-foreground shadow-card">
      <small className="text-xs text-muted-foreground">{a.label} · {shortDate(a.start)} – {shortDate(a.end)}</small>
      <strong className="text-2xl font-semibold tracking-tight tabular-nums">{money(a.total)}</strong>
      <small className="text-xs text-muted-foreground">{a.count} expense{a.count === 1 ? '' : 's'}</small>
      {a.groups.length > 0 && (
        <ul className="my-1.5 grid gap-2.5">
          {a.groups.map((g) => (
            <li key={g.key} className="grid gap-1">
              <div className="flex items-center gap-2 text-sm">
                {a.group_by === 'category' ? <CategoryAvatar cat={catById.get(g.key)} small /> : <span className="size-2.5 flex-none rounded-full" style={{ background: color(g.key) }} />}
                <span className="min-w-0 flex-1 truncate">{groupName(a, g)}</span>
                <strong className="font-semibold tabular-nums">{money(g.amount)}</strong>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full" style={{ width: `${total ? (Number(g.amount) / total) * 100 : 0}%`, background: color(g.key) }} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {a.largest && (
        <small className="text-xs text-muted-foreground">
          Largest: {a.largest.note || catById.get(a.largest.category_id)?.name} · {money(a.largest.amount)} · {shortDate(a.largest.spent_on)}
        </small>
      )}
      {a.budget && (
        <div className="mt-1 grid gap-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="meter" aria-label="Budget used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(used)}>
            <span className="block h-full rounded-full" style={{ width: `${Math.min(used, 100)}%`, background: used > 100 ? 'var(--critical)' : 'var(--series-1)' }} />
          </div>
          <small className={cn('flex items-center gap-1 text-xs', used > 100 ? 'font-semibold text-critical' : 'text-muted-foreground')}>
            {used > 100 && <TriangleAlert className="size-3.5" aria-hidden />} {Math.round(used)}% of the {money(a.budget)} budget
          </small>
        </div>
      )}
    </div>
  )
}

/** IOUs a reply recorded, repaid or listed; due status is as of today. */
function IouCards({ ious, money }: { ious: Iou[]; money: Money }) {
  return (
    <div className="mt-2.5 grid gap-1.5">
      <ul className="grid gap-1.5">
        {ious.map((i) => (
          <li key={i.id} className="flex items-center gap-2.5 rounded-xl bg-card py-2 pr-3 pl-2.5 text-card-foreground shadow-card">
            <PersonAvatar name={i.person} small />
            <span className="grid min-w-0 flex-1">
              <span className="truncate text-sm font-medium">{i.direction === 'lent' ? `${i.person} owes you` : `You owe ${i.person}`}</span>
              <small className="truncate text-xs text-muted-foreground">{isOpen(i) ? dueText(i, today()).text : 'Paid back in full ✓'}</small>
            </span>
            <strong className={cn('text-sm font-semibold tabular-nums', isOpen(i) && i.direction === 'lent' && 'text-good')}>
              {money(isOpen(i) ? leftCents(i) / 100 : i.amount)}
            </strong>
          </li>
        ))}
      </ul>
      <Link to="/ious" className="justify-self-start text-xs font-medium text-primary hover:underline">Open IOUs →</Link>
    </div>
  )
}

export default function Chat() {
  const money = useMoney()
  const firstName = useMe().data?.name.split(' ')[0]
  const categories = useCategories()
  const catById = new Map(categories.data?.map((c) => [c.id, c]))
  const history = useQuery({ queryKey: ['chat'], queryFn: async () => stamp(await api<ChatMessage[]>('/assistant/messages')) })
  const [text, setText] = useState('')
  const [failed, setFailed] = useState<{ text: string; error: string } | null>(null) // last unsent message
  const [now, setNow] = useState(() => Date.now())
  const log = useRef<HTMLDivElement>(null)

  const send = useMutation({
    mutationFn: (message: string) => api<ChatMessage[]>('/assistant/chat', { method: 'POST', body: { message, today: today() } }),
    onMutate: () => setFailed(null),
    onSuccess: (turn) => {
      queryClient.setQueryData<Item[]>(['chat'], (old = []) => [...old, ...stamp(turn)])
      if (turn.some((m) => m.logged.length)) refreshExpenseData()
      if (turn.some((m) => m.ious.length)) refreshIous()
    },
    onError: (e, message) => setFailed({ text: message, error: e.message }),
  })
  const undo = useMutation({
    mutationFn: (id: string) => api(`/expenses/${id}`, { method: 'DELETE' }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['chat'] })
      refreshExpenseData()
    },
  })
  const clear = useMutation({
    mutationFn: () => api('/assistant/messages', { method: 'DELETE' }),
    onSuccess: () => queryClient.setQueryData(['chat'], []),
  })

  const msgs = history.data ?? []
  const ready = !!text.trim() && !send.isPending // something to send, and not already sending
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight })
  }, [msgs.length, send.isPending, failed])

  // tick once a second only while some undo is still open
  const undoOpenUntil = Math.max(0, ...msgs.filter((m) => m.logged.some((e) => !e.removed)).map((m) => m.undoUntil))
  useEffect(() => {
    if (undoOpenUntil <= Date.now()) return
    const timer = setInterval(() => {
      setNow(Date.now())
      if (Date.now() > undoOpenUntil) clearInterval(timer)
    }, 1000)
    return () => clearInterval(timer)
  }, [undoOpenUntil])

  const submit = (raw: string) => {
    const message = raw.trim()
    if (!message || send.isPending) return
    setText('')
    send.mutate(message)
  }

  return (
    <Card className="chat min-h-80 flex-1 gap-0 overflow-hidden py-0" aria-label="Assistant" role="region">
      <header className="flex items-center gap-3 px-4 py-3.5">
        <span className="relative flex-none">
          <Orb className="size-11" />
          <span className="absolute right-0 bottom-0 size-3 rounded-full bg-emerald-500 ring-2 ring-card" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold tracking-tight">Ask Mirrorly</h2>
          <p className="text-sm text-muted-foreground">Your money assistant · log or ask</p>
        </div>
        {msgs.length > 0 && (
          <Button
            variant="ghost" size="icon" className="text-muted-foreground" aria-label="Clear conversation" title="Clear conversation" disabled={clear.isPending}
            onClick={() => confirm('Clear the whole conversation? Logged expenses stay.') && clear.mutate()}
          >
            <RotateCcw aria-hidden />
          </Button>
        )}
      </header>

      <div className="chat-log flex flex-1 flex-col gap-3 overflow-y-auto bg-muted/40 p-4" ref={log} aria-live="polite">
        {history.isPending && (
          <Loading label="Loading conversation">
            {['48%', '66%', '38%', '58%'].map((w, i) => <span key={w} className={`skel bubble${i % 2 ? '' : ' mine'}`} style={{ width: w }} />)}
          </Loading>
        )}
        {history.error && <p className="text-sm text-destructive">{history.error.message}</p>}
        {history.data && msgs.length === 0 && !send.isPending && !failed && (
          <div className="chat-empty my-auto grid justify-items-center gap-3 text-center">
            <Orb className="mb-1 size-16" />
            <div>
              <p className="font-semibold tracking-tight">Hi {firstName}, I'm Mirrorly</p>
              <p className="text-sm text-muted-foreground">Tell me what you spent, or ask about it. Try:</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="rounded-full bg-card px-3.5 py-2 text-sm shadow-card transition-colors hover:bg-accent hover:text-accent-foreground" onClick={() => submit(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {msgs.map((m) => (
          <div key={m.id} className={cn('msg', bubble(m.role), (m.logged.length > 0 || m.answer) && 'max-w-[min(100%,560px)]')}>
            <p>{m.content}</p>
            {m.logged.length > 0 && (
              <ul className="mt-2.5 grid gap-1.5">
                {m.logged.map((e) => {
                  const cat = catById.get(e.category_id)
                  return (
                    <li key={e.id} className={cn('flex items-center gap-2.5 rounded-xl bg-card py-2 pr-1.5 pl-2.5 text-card-foreground shadow-card', e.removed && 'opacity-60')}>
                      <CategoryAvatar cat={cat} />
                      <span className="grid min-w-0 flex-1">
                        <span className="truncate text-sm font-medium">{e.note || cat?.name}</span>
                        <small className="truncate text-xs text-muted-foreground">
                          {[cat?.name, e.payment_method.toUpperCase(), e.spent_on !== today() && shortDate(e.spent_on)].filter(Boolean).join(' · ')}
                        </small>
                      </span>
                      <strong className={cn('text-sm font-semibold tabular-nums', e.removed && 'line-through')}>{money(e.amount)}</strong>
                      {e.removed ? <small className="pr-1 text-xs text-muted-foreground">Removed</small> : now < m.undoUntil && (() => {
                        const left = Math.min(UNDO_SECONDS, Math.ceil((m.undoUntil - now) / 1000))
                        return (
                          <Button
                            variant="ghost" size="sm" className="gap-1 px-2 text-xs text-primary tabular-nums" title="Undo (available for 1 minute)" disabled={undo.isPending}
                            aria-label={`Undo ${e.note || 'expense'}, ${left} seconds left`} onClick={() => undo.mutate(e.id)}
                          >
                            <Undo2 aria-hidden /> <span>{left}s</span>
                          </Button>
                        )
                      })()}
                    </li>
                  )
                })}
              </ul>
            )}
            {m.answer && <AnswerCard a={m.answer} catById={catById} money={money} />}
            {m.ious.length > 0 && <IouCards ious={m.ious} money={money} />}
          </div>
        ))}

        {send.isPending && (
          <>
            <div className={bubble('user')}><p>{send.variables}</p></div>
            <div className={cn(bubble('assistant'), 'typing flex gap-1.5 py-4 text-muted-foreground')} role="status"><span className="sr-only">Thinking…</span><i /><i /><i /></div>
          </>
        )}
        {failed && (
          <>
            <div className={cn(bubble('user'), 'opacity-60')}><p>{failed.text}</p></div>
            <div className={cn(bubble('assistant'), 'text-destructive')}>
              <p>{failed.error}</p>
              <Button variant="secondary" size="sm" className="mt-2 rounded-full text-foreground" onClick={() => submit(failed.text)}>Retry</Button>
            </div>
          </>
        )}
        {undo.error && <p className="text-sm text-destructive">Couldn't undo: {undo.error.message}</p>}
      </div>

      {/* one composer pill: the send button sits inside the field and lights up once there's something to send */}
      <form className="p-3" onSubmit={(e) => { e.preventDefault(); submit(text) }}>
        <div className="flex items-center gap-2 rounded-full bg-muted p-1.5 pl-5 transition-[background-color,box-shadow] focus-within:bg-card focus-within:shadow-card focus-within:ring-[3px] focus-within:ring-ring/20">
          <input
            value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} aria-label="Message"
            placeholder="e.g. Bought a bag for 2500"
            className="h-9 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm"
          />
          <Button
            size="icon" aria-label="Send" disabled={!ready}
            className={cn(
              'size-9 flex-none rounded-full transition-all disabled:opacity-100',
              ready ? 'bg-linear-135 from-indigo-500 to-fuchsia-500 text-white shadow-md shadow-indigo-500/30 hover:brightness-110' : 'bg-foreground/10 text-muted-foreground',
            )}
          >
            <ArrowUp className="size-[1.125rem]" strokeWidth={2.5} aria-hidden />
          </Button>
        </div>
      </form>
    </Card>
  )
}
