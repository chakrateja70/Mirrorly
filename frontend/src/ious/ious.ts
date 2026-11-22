import type { Iou } from '../api'

const cents = (s: string) => Math.round(Number(s) * 100)
const day = (s: string) => new Date(`${s}T00:00`).getTime()

/** Still owed, in cents. */
export const leftCents = (i: Iou) => cents(i.amount) - cents(i.repaid)
export const isOpen = (i: Iou) => leftCents(i) > 0

/** Whole days until the due date (negative = overdue), or null without one. Local dates, DST-safe. */
export const daysLeft = (i: Iou, today: string) => (i.due_on === null ? null : Math.round((day(i.due_on) - day(today)) / 86_400_000))

export type Tone = 'overdue' | 'soon' | 'later' | 'none'
export function dueText(i: Iou, today: string): { text: string; tone: Tone } {
  const d = daysLeft(i, today)
  if (d === null) return { text: 'No due date', tone: 'none' }
  if (d < 0) return { text: `Overdue by ${-d} day${d === -1 ? '' : 's'}`, tone: 'overdue' }
  if (d === 0) return { text: 'Due today', tone: 'soon' }
  if (d === 1) return { text: 'Due tomorrow', tone: 'soon' }
  return { text: `Due in ${d} days`, tone: d <= 3 ? 'soon' : 'later' }
}

/** Open IOUs, soonest due first; no due date last, then oldest first. */
export const byDue = (a: Iou, b: Iou) =>
  (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999') || a.given_on.localeCompare(b.given_on)

/** What's still out, in cents, over open IOUs. */
export function totals(ious: Iou[], today: string) {
  let owedToYou = 0
  let youOwe = 0
  let overdue = 0
  for (const i of ious.filter(isOpen)) {
    if (i.direction === 'lent') owedToYou += leftCents(i)
    else youOwe += leftCents(i)
    if ((daysLeft(i, today) ?? 0) < 0) overdue++
  }
  return { owedToYou, youOwe, overdue }
}

/** The friendly nudge "Remind" sends to someone who owes you. */
export function reminderText(i: Iou, money: (v: number) => string) {
  const on = new Date(`${i.given_on}T00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  return `Hi ${i.person}! Just a friendly reminder about the ${money(leftCents(i) / 100)} I lent you on ${on}`
    + `${i.note ? ` (${i.note})` : ''}. No rush, thanks! 🙂`
}
