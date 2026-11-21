import { useMutation } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useEffect, useRef, type FormEvent } from 'react'
import { api, PAYMENT_METHODS, today, type Category, type Expense } from '../../api'
import { refreshExpenseData } from './queries'

type Props = { expense: Expense | null; categories: Category[]; onClose: () => void }

/** Add/edit expense in a native modal <dialog>. `expense: null` = add. */
export default function ExpenseForm({ expense, categories, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => ref.current?.showModal(), [])

  const save = useMutation({
    mutationFn: (body: Record<string, FormDataEntryValue>) =>
      expense
        ? api(`/expenses/${expense.id}`, { method: 'PATCH', body })
        : api('/expenses', { method: 'POST', body }),
    onSuccess: async () => { await refreshExpenseData(); onClose() },
  })
  const remove = useMutation({
    mutationFn: () => api(`/expenses/${expense!.id}`, { method: 'DELETE' }),
    onSuccess: async () => { await refreshExpenseData(); onClose() },
  })

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    save.mutate(Object.fromEntries(new FormData(e.currentTarget)))
  }
  const error = save.error ?? remove.error

  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="expense-form-title">
      <form onSubmit={onSubmit} className="stack">
        <h2 id="expense-form-title">{expense ? 'Edit expense' : 'Add expense'}</h2>
        <label>
          Amount
          <input
            name="amount" type="number" inputMode="decimal" step="0.01" min="0.01" required autoFocus
            defaultValue={expense?.amount}
          />
        </label>
        <label>
          Date
          <input name="spent_on" type="date" required defaultValue={expense?.spent_on ?? today()} />
        </label>
        <label>
          Category
          <select name="category_id" required defaultValue={expense?.category_id}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>
          Paid with
          <select name="payment_method" defaultValue={expense?.payment_method ?? 'upi'}>
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}
          </select>
        </label>
        <label>
          Note
          <input name="note" maxLength={500} defaultValue={expense?.note} placeholder="Optional" />
        </label>
        {error && <p className="error" role="alert">{error.message}</p>}
        <div className="row">
          {expense && (
            <button
              type="button" className="danger" disabled={remove.isPending}
              onClick={() => confirm('Delete this expense?') && remove.mutate()}
            >
              <Trash2 size={16} aria-hidden /> Delete
            </button>
          )}
          <span className="spacer" />
          <button type="button" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </dialog>
  )
}
