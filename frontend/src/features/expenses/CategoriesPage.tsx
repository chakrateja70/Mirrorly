import { useMutation } from '@tanstack/react-query'
import { LockKeyhole, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { api, ApiError, type Category } from '../../api'
import { refreshExpenseData, useCategories } from './queries'

/** Form fields -> API body. Empty budget clears it (null). */
const toBody = (form: HTMLFormElement) => {
  const f = Object.fromEntries(new FormData(form)) as Record<string, string>
  return { name: f.name.trim(), color: f.color, monthly_budget: f.monthly_budget || null }
}

/** The server answers 403 once the PIN unlock has expired (10 minutes). */
const isLocked = (e: Error) => e instanceof ApiError && e.status === 403

function CategoryRow({ cat, onLocked }: { cat?: Category; onLocked: () => void }) {
  const save = useMutation({
    mutationFn: (body: ReturnType<typeof toBody>) =>
      cat ? api(`/categories/${cat.id}`, { method: 'PATCH', body }) : api('/categories', { method: 'POST', body }),
    onSuccess: refreshExpenseData,
    onError: (e) => isLocked(e) && onLocked(),
  })
  const remove = useMutation({
    mutationFn: () => api(`/categories/${cat!.id}`, { method: 'DELETE' }),
    onSuccess: refreshExpenseData,
    onError: (e) => isLocked(e) && onLocked(),
  })

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    save.mutate(toBody(form), { onSuccess: () => { if (!cat) form.reset() } })
  }
  const error = save.error ?? remove.error

  return (
    <li>
      <form className="cat-row" onSubmit={onSubmit}>
        <input name="color" type="color" defaultValue={cat?.color ?? '#6b7280'} aria-label="Color" />
        <input name="name" required maxLength={50} defaultValue={cat?.name} placeholder="New category" aria-label="Name" />
        <input
          name="monthly_budget" type="number" inputMode="decimal" step="0.01" min="0.01"
          defaultValue={cat?.monthly_budget ?? ''} placeholder="Monthly budget" aria-label="Monthly budget"
        />
        <button className={cat ? '' : 'primary'} disabled={save.isPending}>{cat ? 'Save' : 'Add'}</button>
        {cat && (
          <button
            type="button" className="danger ghost icon-btn" aria-label={`Delete ${cat.name}`} title="Delete" disabled={remove.isPending}
            onClick={() => confirm(`Delete "${cat.name}"?`) && remove.mutate()}
          >
            <Trash2 size={18} aria-hidden />
          </button>
        )}
      </form>
      {error && <p className="error" role="alert">{error.message}</p>}
      {save.isSuccess && cat && <small className="muted">Saved</small>}
    </li>
  )
}

function PinGate({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState('')
  const unlock = useMutation({
    mutationFn: () => api('/categories/unlock', { method: 'POST', body: { pin } }),
    onSuccess: onUnlock,
    onError: () => setPin(''),
  })
  return (
    <form className="card pin-gate" onSubmit={(e) => { e.preventDefault(); unlock.mutate() }}>
      <span className="pin-icon"><LockKeyhole size={22} aria-hidden /></span>
      <h2>Enter your PIN</h2>
      <p className="muted">Categories and budgets are protected. Enter the PIN to manage them.</p>
      <input
        className="pin-input" type="password" inputMode="numeric" autoComplete="off" maxLength={32} required autoFocus
        aria-label="PIN" value={pin} onChange={(e) => setPin(e.target.value)}
      />
      {unlock.error && <p className="error" role="alert">{unlock.error.message}</p>}
      <button className="primary" disabled={unlock.isPending || !pin}>{unlock.isPending ? 'Checking…' : 'Unlock'}</button>
    </form>
  )
}

export default function CategoriesPage() {
  const [unlocked, setUnlocked] = useState(false) // asked on every visit; the server enforces it on every change
  const categories = useCategories()
  if (!unlocked) return <PinGate onUnlock={() => setUnlocked(true)} />

  const lock = () => setUnlocked(false)
  return (
    <section>
      <h2>Categories</h2>
      <p className="muted">Set an optional monthly budget for any category. Leave empty for no limit.</p>
      {categories.error && <p className="error">{categories.error.message}</p>}
      <ul className="list cats">
        <CategoryRow onLocked={lock} />
        {categories.data?.map((c) => <CategoryRow key={c.id} cat={c} onLocked={lock} />)}
      </ul>
    </section>
  )
}
