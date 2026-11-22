import { useMutation } from '@tanstack/react-query'
import { Check, LockKeyhole, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { api, ApiError, type Category } from '../../api'
import { SkeletonList } from '../../Skeleton'
import { CategoryIcon } from './CategoryAvatar'
import { refreshExpenseData, useCategories } from './queries'

const DEFAULT_COLOR = '#6b7280'

/** Form fields -> API body. Empty budget clears it (null). */
const toBody = (form: HTMLFormElement) => {
  const f = Object.fromEntries(new FormData(form)) as Record<string, string>
  return { name: f.name.trim(), color: f.color, monthly_budget: f.monthly_budget || null }
}

/** The server answers 403 once the PIN unlock has expired (10 minutes). */
const isLocked = (e: Error) => e instanceof ApiError && e.status === 403

function CategoryRow({ cat, onLocked }: { cat?: Category; onLocked: () => void }) {
  const [color, setColor] = useState(cat?.color ?? DEFAULT_COLOR)
  const [name, setName] = useState(cat?.name ?? '') // live, so the icon follows what's typed
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
    save.mutate(toBody(form), {
      onSuccess: () => {
        if (cat) return
        form.reset()
        setName('')
        setColor(DEFAULT_COLOR)
      },
    })
  }
  const error = save.error ?? remove.error

  return (
    <li className="grid gap-1.5 px-4 py-3">
      <form className="flex flex-wrap items-center gap-2 sm:flex-nowrap" onSubmit={onSubmit}>
        {/* the category's icon on its color; tapping it opens the native color picker */}
        <label className="relative grid size-10 flex-none cursor-pointer place-items-center rounded-full text-white shadow-sm" style={{ background: color }} title="Change color">
          <CategoryIcon name={name} className="size-5 drop-shadow-[0_1px_1px_rgb(0_0_0/0.3)]" aria-hidden />
          <input name="color" type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Color" className="absolute inset-0 size-full cursor-pointer opacity-0" />
        </label>
        <Input
          name="name" required maxLength={50} defaultValue={cat?.name} placeholder="New category" aria-label="Name"
          onChange={(e) => setName(e.target.value)} className="min-w-0 flex-[1_1_calc(100%-3rem)] sm:flex-[2]"
        />
        <Input
          name="monthly_budget" type="number" inputMode="decimal" step="0.01" min="0.01" className="min-w-0 flex-1 sm:flex-[1.3]"
          defaultValue={cat?.monthly_budget ?? ''} placeholder="Monthly budget" aria-label="Monthly budget"
        />
        <Button variant={cat ? 'secondary' : 'default'} disabled={save.isPending}>
          {cat ? 'Save' : <><Plus aria-hidden /> Add</>}
        </Button>
        {cat && (
          <Button
            type="button" variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            aria-label={`Delete ${cat.name}`} title="Delete" disabled={remove.isPending}
            onClick={() => confirm(`Delete "${cat.name}"?`) && remove.mutate()}
          >
            <Trash2 aria-hidden />
          </Button>
        )}
      </form>
      {error && <p className="text-sm text-destructive" role="alert">{error.message}</p>}
      {save.isSuccess && cat && <small className="flex items-center gap-1 text-xs text-good"><Check className="size-3.5" aria-hidden /> Saved</small>}
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
    <Card className="mx-auto mt-6 max-w-sm items-center gap-3 px-6 py-8 text-center">
      <form className="grid w-full justify-items-center gap-3" onSubmit={(e) => { e.preventDefault(); unlock.mutate() }}>
        <span className="grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground"><LockKeyhole aria-hidden /></span>
        <h2 className="text-lg font-semibold tracking-tight">Enter your PIN</h2>
        <p className="text-sm text-muted-foreground">Categories and budgets are protected. Enter the PIN to manage them.</p>
        <Input
          className="h-12 max-w-56 pl-5 text-center text-2xl tracking-[0.5em]" type="password" inputMode="numeric" autoComplete="off" maxLength={32} required autoFocus
          aria-label="PIN" value={pin} onChange={(e) => setPin(e.target.value)}
        />
        {unlock.error && <p className="text-sm text-destructive" role="alert">{unlock.error.message}</p>}
        <Button className="w-full max-w-56" disabled={unlock.isPending || !pin}>{unlock.isPending ? 'Checking…' : 'Unlock'}</Button>
      </form>
    </Card>
  )
}

export default function CategoriesPage() {
  const [unlocked, setUnlocked] = useState(false) // asked on every visit; the server enforces it on every change
  const categories = useCategories()
  if (!unlocked) return <PinGate onUnlock={() => setUnlocked(true)} />

  const lock = () => setUnlocked(false)
  return (
    <section className="grid gap-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Categories</h2>
        <p className="text-sm text-muted-foreground">Set an optional monthly budget for any category. Leave empty for no limit.</p>
      </div>
      {categories.error && <p className="text-destructive">{categories.error.message}</p>}
      {categories.isPending && <SkeletonList label="Loading categories" rows={8} />}
      <Card className="gap-0 overflow-hidden py-1">
        <ul className="divide-y divide-border/60">
          <CategoryRow onLocked={lock} />
          {categories.data?.map((c) => <CategoryRow key={c.id} cat={c} onLocked={lock} />)}
        </ul>
      </Card>
    </section>
  )
}
