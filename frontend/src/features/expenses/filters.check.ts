/// <reference types="node" />
// Runnable check for the filter logic:  node src/features/expenses/filters.check.ts
import assert from 'node:assert/strict'
import type { Expense } from '../../api'
import { categoryIcon } from './categoryIcon.ts'
import { activeCount, applyFilters, initialFilters, monthsSpanned, pageNumbers, pageQuery, periodRange } from './filters.ts'

const jan15 = new Date(2026, 0, 15)
assert.deepEqual(periodRange('today', jan15), ['2026-01-15', '2026-01-15'])
assert.deepEqual(periodRange('this-month', jan15), ['2026-01-01', '2026-01-31'])
assert.deepEqual(periodRange('last-month', jan15), ['2025-12-01', '2025-12-31']) // year rollover
assert.deepEqual(periodRange('last-3', jan15), ['2025-11-01', '2026-01-31'])
assert.deepEqual(periodRange('last-6', new Date(2026, 2, 31)), ['2025-10-01', '2026-03-31']) // no day-31 overflow
assert.deepEqual(periodRange('this-year', jan15), ['2026-01-01', '2026-12-31'])
assert.deepEqual(periodRange('this-month', new Date(2028, 1, 10)), ['2028-02-01', '2028-02-29']) // leap year
assert.equal(monthsSpanned('2026-11-01', '2026-11-30'), 1)
assert.equal(monthsSpanned('2025-11-15', '2026-01-02'), 3)

const e = (id: string, category_id: string, payment_method: Expense['payment_method'], amount: string) =>
  ({ id, category_id, payment_method, amount }) as Expense
const list = [e('1', 'f', 'upi', '250.00'), e('2', 'x', 'card', '20.00'), e('3', 'f', 'cash', '20.01')]
const ids = (f: Partial<ReturnType<typeof initialFilters>>) => applyFilters(list, { ...initialFilters(), ...f }).map((x) => x.id)
assert.deepEqual(ids({}), ['1', '2', '3'])
assert.deepEqual(ids({ categories: ['f'] }), ['1', '3'])
assert.deepEqual(ids({ methods: ['card', 'cash'] }), ['2', '3'])
assert.deepEqual(ids({ min: '20' }), ['1', '2', '3']) // bounds are inclusive
assert.deepEqual(ids({ min: '20.01' }), ['1', '3'])
assert.deepEqual(ids({ max: '20' }), ['2'])
assert.deepEqual(ids({ min: '20.01', max: '100', categories: ['f'] }), ['3'])
assert.deepEqual(ids({ min: ' ', max: 'abc' }), ['1', '2', '3']) // blank / non-numeric bounds are ignored

const nov = { ...initialFilters(), start: '2026-11-01', end: '2026-11-30' }
assert.equal(pageQuery(nov, 0), 'start=2026-11-01&end=2026-11-30&limit=10&offset=0')
assert.equal(
  pageQuery({ ...nov, categories: ['a', 'b'], methods: ['upi'], min: '20.005', max: 'abc' }, 2),
  'start=2026-11-01&end=2026-11-30&limit=10&offset=20&category=a&category=b&method=upi&min_amount=20.01', // same rounding as applyFilters
)
assert.deepEqual(pageNumbers(0, 1), [0])
assert.deepEqual(pageNumbers(0, 3), [0, 1, 2]) // one-page gap shown, not an ellipsis
assert.deepEqual(pageNumbers(0, 9), [0, null, 8])
assert.deepEqual(pageNumbers(2, 9), [0, 1, 2, null, 8])
assert.deepEqual(pageNumbers(4, 9), [0, null, 4, null, 8])
assert.deepEqual(pageNumbers(8, 9), [0, null, 8])

assert.equal(activeCount(initialFilters()), 0)
assert.equal(activeCount(initialFilters('today'), 'today'), 0) // Transactions' default view counts as unfiltered
assert.equal(activeCount(initialFilters('this-month'), 'today'), 1)
assert.equal(initialFilters('today').start, initialFilters('today').end)
assert.equal(activeCount({ ...initialFilters(), period: 'last-month', categories: ['a', 'b'], methods: ['upi'], min: '10', max: ' ' }), 5)
// category icons come from the name
const icon = (n: string) => categoryIcon(n).displayName
for (const [name, want] of [
  ['Food', 'Utensils'], ['Groceries', 'ShoppingCart'], ['Transport', 'Bus'], ['Shopping', 'ShoppingBag'], ['Bills', 'Receipt'],
  ['Health', 'HeartPulse'], ['Entertainment', 'Clapperboard'], ['Other', 'Tag'], ['Travel', 'Plane'], ['Business', 'Tag'], // "bus" is whole-word only
  ['Buses', 'Bus'], ['Home loan', 'House'], ['Fast food', 'Utensils'], ['', 'Tag'],
]) assert.equal(icon(name), want, name)
console.log('filters ok')
