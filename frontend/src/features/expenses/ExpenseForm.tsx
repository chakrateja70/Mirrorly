import { useMutation } from '@tanstack/react-query'
import { CalendarDays, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar-lazy'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { api, PAYMENT_METHODS, today, type Category, type Expense, type PaymentMethod } from '../../api'
import CategoryAvatar from './CategoryAvatar'
import { iso, parseDay } from './filters'
import { refreshExpenseData } from './queries'

type Props = { expense: Expense | null; categories: Category[]; onClose: () => void }

/** Add/edit an expense in a modal dialog. `expense: null` = add. */
export default function ExpenseForm({ expense, categories, onClose }: Props) {
  const [day, setDay] = useState(expense?.spent_on ?? today())
  const [method, setMethod] = useState<PaymentMethod>(expense?.payment_method ?? 'upi')
  const [dayOpen, setDayOpen] = useState(false)

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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{expense ? 'Edit expense' : 'Add expense'}</DialogTitle>
            <DialogDescription>{expense ? 'Change any detail, or delete it.' : 'What did you spend, and on what?'}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount" name="amount" type="number" inputMode="decimal" step="0.01" min="0.01" required autoFocus
              className="h-12 text-xl font-semibold tabular-nums" defaultValue={expense?.amount} placeholder="0.00"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="spent_on">Date</Label>
              <input type="hidden" name="spent_on" value={day} />
              <Popover open={dayOpen} onOpenChange={setDayOpen}>
                <PopoverTrigger asChild>
                  <Button id="spent_on" type="button" variant="secondary" className="justify-start bg-muted font-normal">
                    <CalendarDays aria-hidden /> {parseDay(day).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" required autoFocus selected={parseDay(day)} defaultMonth={parseDay(day)} onSelect={(d) => { setDay(iso(d)); setDayOpen(false) }} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="category">Category</Label>
              <Select name="category_id" required defaultValue={expense?.category_id ?? categories[0]?.id}>
                <SelectTrigger id="category" className="w-full"><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}><CategoryAvatar cat={c} small /> {c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <span className="text-sm font-medium" id="method-label">Paid with</span>
            <input type="hidden" name="payment_method" value={method} />
            <div className="flex flex-wrap gap-2" role="group" aria-labelledby="method-label">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m} type="button" aria-pressed={method === m} onClick={() => setMethod(m)}
                  className={cn(
                    'h-9 rounded-full bg-muted px-3.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
                    'aria-pressed:bg-primary aria-pressed:text-primary-foreground',
                  )}
                >
                  {m.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="note">Note</Label>
            <Input id="note" name="note" maxLength={500} defaultValue={expense?.note} placeholder="Optional" />
          </div>
          {error && <p className="text-sm text-destructive" role="alert">{error.message}</p>}
          <DialogFooter className="flex-row gap-2">
            {expense && (
              <Button
                type="button" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={remove.isPending}
                onClick={() => confirm('Delete this expense?') && remove.mutate()}
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
