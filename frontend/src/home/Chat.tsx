import { useMutation, useQuery } from '@tanstack/react-query'
import { RotateCcw, SendHorizontal, Sparkles, TriangleAlert, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api, METHOD_COLOR, queryClient, today, type Answer, type Category, type ChatMessage, type PaymentMethod } from '../api'
import { useMoney } from '../auth/useMe'
import { refreshExpenseData, useCategories } from '../features/expenses/queries'

const SUGGESTIONS = [
  'I purchased a soap of cost 20 rupees',
  'How much did I spend on food this month?',
  'What did I spend the most on last month?',
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
    <div className="answer">
      <small className="muted">{a.label} · {shortDate(a.start)} – {shortDate(a.end)}</small>
      <strong className="answer-total">{money(a.total)}</strong>
      <small className="muted">{a.count} expense{a.count === 1 ? '' : 's'}</small>
      {a.groups.length > 0 && (
        <ul className="meters answer-groups">
          {a.groups.map((g) => (
            <li key={g.key}>
              <div className="row">
                <span className="dot" style={{ background: color(g.key) }} />
                <span className="spacer">{groupName(a, g)}</span>
                <strong>{money(g.amount)}</strong>
              </div>
              <div className="bar"><span style={{ width: `${total ? (Number(g.amount) / total) * 100 : 0}%`, background: color(g.key) }} /></div>
            </li>
          ))}
        </ul>
      )}
      {a.largest && (
        <small className="muted">
          Largest: {a.largest.note || catById.get(a.largest.category_id)?.name} · {money(a.largest.amount)} · {shortDate(a.largest.spent_on)}
        </small>
      )}
      {a.budget && (
        <div>
          <div className="bar" role="meter" aria-label="Budget used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(used)}>
            <span style={{ width: `${Math.min(used, 100)}%`, background: used > 100 ? 'var(--critical)' : 'var(--series-1)' }} />
          </div>
          <small className={used > 100 ? 'over' : 'muted'}>
            {used > 100 && <TriangleAlert size={14} aria-hidden />} {Math.round(used)}% of the {money(a.budget)} budget
          </small>
        </div>
      )}
    </div>
  )
}

export default function Chat() {
  const money = useMoney()
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
    <section className="card chat" aria-label="Assistant">
      <header className="chat-head">
        <span className="bot-icon"><Sparkles size={18} aria-hidden /></span>
        <div className="grow">
          <h2>Ask Mirrorly</h2>
          <p className="muted">Log spending or ask about it.</p>
        </div>
        {msgs.length > 0 && (
          <button
            className="ghost icon-btn" aria-label="Clear conversation" title="Clear conversation" disabled={clear.isPending}
            onClick={() => confirm('Clear the whole conversation? Logged expenses stay.') && clear.mutate()}
          >
            <RotateCcw size={18} aria-hidden />
          </button>
        )}
      </header>

      <div className="chat-log" ref={log} aria-live="polite">
        {history.isPending && <p className="muted">Loading conversation…</p>}
        {history.error && <p className="error">{history.error.message}</p>}
        {history.data && msgs.length === 0 && !send.isPending && !failed && (
          <div className="chat-empty">
            <p className="muted">Try one of these:</p>
            <div className="chips">
              {SUGGESTIONS.map((s) => <button key={s} className="chip" onClick={() => submit(s)}>{s}</button>)}
            </div>
          </div>
        )}

        {msgs.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            <p>{m.content}</p>
            {m.logged.length > 0 && (
              <ul className="logged">
                {m.logged.map((e) => {
                  const cat = catById.get(e.category_id)
                  return (
                    <li key={e.id} className={e.removed ? 'gone' : undefined}>
                      <span className="dot" style={{ background: cat?.color }} />
                      <span className="grow">
                        <span>{e.note || cat?.name}</span>
                        <small className="muted">
                          {[cat?.name, e.payment_method.toUpperCase(), e.spent_on !== today() && shortDate(e.spent_on)].filter(Boolean).join(' · ')}
                        </small>
                      </span>
                      <strong>{money(e.amount)}</strong>
                      {e.removed ? <small className="muted">Removed</small> : now < m.undoUntil && (() => {
                        const left = Math.min(UNDO_SECONDS, Math.ceil((m.undoUntil - now) / 1000))
                        return (
                          <button
                            className="ghost undo-btn" title="Undo (available for 1 minute)" disabled={undo.isPending}
                            aria-label={`Undo ${e.note || 'expense'}, ${left} seconds left`} onClick={() => undo.mutate(e.id)}
                          >
                            <Undo2 size={16} aria-hidden /> <span>{left}s</span>
                          </button>
                        )
                      })()}
                    </li>
                  )
                })}
              </ul>
            )}
            {m.answer && <AnswerCard a={m.answer} catById={catById} money={money} />}
          </div>
        ))}

        {send.isPending && (
          <>
            <div className="msg user"><p>{send.variables}</p></div>
            <div className="msg assistant typing">Thinking…</div>
          </>
        )}
        {failed && (
          <>
            <div className="msg user unsent"><p>{failed.text}</p></div>
            <div className="msg assistant error">
              <p>{failed.error}</p>
              <button className="chip" onClick={() => submit(failed.text)}>Retry</button>
            </div>
          </>
        )}
        {undo.error && <p className="error">Couldn't undo: {undo.error.message}</p>}
      </div>

      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); submit(text) }}>
        <input
          value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} aria-label="Message"
          placeholder="e.g. Bought a bag for 2500"
        />
        <button className="primary icon-btn" aria-label="Send" disabled={!text.trim() || send.isPending}>
          <SendHorizontal size={18} aria-hidden />
        </button>
      </form>
    </section>
  )
}
