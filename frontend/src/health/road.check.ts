// Runnable check for the road helpers:  node src/health/road.check.ts
import assert from 'node:assert/strict'
import { clock, currentStop, hm, layoutRoad, since, slept } from './road.ts'

assert.equal(clock('00:30'), '12:30 AM')
assert.equal(clock('13:05'), '1:05 PM')
assert.equal(clock('12:00'), '12:00 PM')
assert.equal(hm(370), '6h 10m')
assert.equal(hm(45), '45m')
assert.equal(hm(120), '2h')
assert.equal(slept('23:30', '07:00'), 450) // across midnight
assert.equal(slept('01:00', '08:00'), 420)
assert.equal(since('01:00', '08:00'), 1020) // 1 AM is late in a day that starts at 8 AM

// the stop you're at: last one whose time has come, counted from wake, across midnight
const times = ['08:00', '09:00', '13:30', '20:45', '00:30', '01:00']
assert.equal(currentStop(times, '08:00'), 0)
assert.equal(currentStop(times, '12:59'), 1)
assert.equal(currentStop(times, '13:30'), 2)
assert.equal(currentStop(times, '23:59'), 3)
assert.equal(currentStop(times, '00:45'), 4) // past midnight, still today's route
assert.equal(currentStop(times, '07:00'), 5) // before waking: asleep
assert.equal(currentStop([], '10:00'), -1)

// switchback layout: pins alternate lanes beside their cards; the road starts at the top, ends at the bottom,
// and swings across only in the gaps between cards
const boxes = [{ top: 0, height: 100 }, { top: 156, height: 80 }, { top: 292, height: 120 }]
const road = layoutRoad(boxes, 400, 64, 1, 460)
assert.deepEqual(road.pins, [{ x: 32, y: 28 }, { x: 368, y: 184 }, { x: 32, y: 320 }])
assert.ok(road.road.startsWith('M 32 0 L 32 28 L 32 88 C 32 128 368 128 368 168 L 368 184'), road.road)
assert.ok(road.road.endsWith('L 32 460'), road.road)
assert.equal(road.travelled, 'M 32 0 L 32 28 L 32 88 C 32 128 368 128 368 168 L 368 184') // up to the current pin
assert.equal(layoutRoad(boxes, 400, 64, -1, 460).travelled, '')
assert.deepEqual(layoutRoad([{ top: 0, height: 30 }], 400, 64, 0, 80).pins, [{ x: 32, y: 15 }]) // short card: pin centered
assert.equal(layoutRoad([], 400, 64, 0, 80).road, '')

console.log('road.check: ok')
