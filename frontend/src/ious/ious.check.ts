// Runnable check for the IOU helpers:  node src/ious/ious.check.ts
import assert from 'node:assert/strict'
import type { Iou } from '../api'
import { byDue, dueText, isOpen, leftCents, reminderText, totals } from './ious.ts'

const iou = (p: Partial<Iou>): Iou =>
  ({ id: 'x', person: 'Rahul', direction: 'lent', amount: '500.00', repaid: '0.00', given_on: '2026-11-22', due_on: '2026-11-27', note: '', ...p })
const today = '2026-11-22'

assert.equal(leftCents(iou({ repaid: '199.99' })), 30001) // cents, no float drift
assert.equal(isOpen(iou({ repaid: '500.00' })), false)
assert.deepEqual(dueText(iou({}), today), { text: 'Due in 5 days', tone: 'later' })
assert.deepEqual(dueText(iou({ due_on: '2026-11-25' }), today), { text: 'Due in 3 days', tone: 'soon' })
assert.deepEqual(dueText(iou({ due_on: '2026-11-23' }), today), { text: 'Due tomorrow', tone: 'soon' })
assert.deepEqual(dueText(iou({ due_on: today }), today), { text: 'Due today', tone: 'soon' })
assert.deepEqual(dueText(iou({ due_on: '2026-11-21' }), today), { text: 'Overdue by 1 day', tone: 'overdue' })
assert.deepEqual(dueText(iou({ due_on: '2026-11-12' }), today), { text: 'Overdue by 10 days', tone: 'overdue' })
assert.deepEqual(dueText(iou({ due_on: null }), today), { text: 'No due date', tone: 'none' })
assert.deepEqual(dueText(iou({ due_on: '2026-11-02' }), '2026-11-01'), { text: 'Due tomorrow', tone: 'soon' }) // across a DST change

assert.deepEqual(totals([
  iou({ amount: '500.00', repaid: '200.00', due_on: '2026-11-20' }), // overdue, 300 left
  iou({ amount: '100.00', due_on: null }),
  iou({ direction: 'borrowed', amount: '250.50' }),
  iou({ amount: '999.00', repaid: '999.00', due_on: '2026-01-01' }), // settled: ignored even though "overdue"
], today), { owedToYou: 40000, youOwe: 25050, overdue: 1 })

assert.deepEqual(
  [iou({ id: 'none', due_on: null }), iou({ id: 'late', due_on: '2026-12-01' }), iou({ id: 'soon', due_on: '2026-11-23' })].sort(byDue).map((i) => i.id),
  ['soon', 'late', 'none'],
)

const text = reminderText(iou({ repaid: '100.00', note: 'Movie' }), (v) => `₹${v}`)
assert.ok(text.startsWith('Hi Rahul!') && text.includes('₹400') && text.includes('(Movie)'), text)
console.log('ious ok')
