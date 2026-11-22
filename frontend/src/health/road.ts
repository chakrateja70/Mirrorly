// Road geometry and time helpers for the Food & Health roadmaps (pure; checked by road.check.ts).

/** "HH:MM" -> minutes since midnight */
export const mins = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
/** Minutes after `start` on a clock that wraps at midnight: the day runs wake -> sleep, even past 12 AM. */
export const since = (hhmm: string, start: string) => (mins(hhmm) - mins(start) + 1440) % 1440

/** "13:05" -> "1:05 PM" */
export function clock(hhmm: string) {
  const m = mins(hhmm)
  const h = Math.floor(m / 60)
  return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

/** 370 -> "6h 10m" */
export function hm(minutes: number) {
  const h = Math.floor(Math.abs(minutes) / 60), r = Math.round(Math.abs(minutes) % 60)
  return h && r ? `${h}h ${r}m` : h ? `${h}h` : `${r}m`
}

/** Bed and wake times -> minutes slept (across midnight). */
export const slept = (bed: string, wake: string) => since(wake, bed)

/**
 * Index of the stop the user is at now: the last one whose time has come, counting from the first stop (wake).
 * Before waking, the night still belongs to the last stop (sleep).
 */
export function currentStop(times: string[], now: string) {
  if (!times.length) return -1
  const t = since(now, times[0])
  let at = 0
  times.forEach((x, i) => { if (since(x, times[0]) <= t) at = i })
  return at
}

export type Box = { top: number; height: number }
export type Pt = { x: number; y: number }
export type RoadLayout = { pins: Pt[]; road: string; travelled: string; height: number }

/**
 * A switchback road through stacked cards: card i sits on alternating sides; its pin stands in the free lane
 * beside it, level with the card's title. The road runs down that lane alongside the card, swings across the gap
 * below it to the other lane, and on to the next pin. Nothing crosses a card. Units: px within the list.
 */
export function layoutRoad(boxes: Box[], width: number, lane: number, current: number, bottom: number, pinOffset = 28): RoadLayout {
  const xs = [lane / 2, width - lane / 2]
  const pins = boxes.map((b, i) => ({ x: xs[i % 2], y: b.top + Math.min(pinOffset, b.height / 2) }))
  if (!pins.length) return { pins, road: '', travelled: '', height: bottom }
  const r = (n: number) => Math.round(n * 10) / 10
  const segs = [`L ${r(pins[0].x)} ${r(pins[0].y)}`] // lead-in from the top edge
  for (let i = 1; i < pins.length; i++) {
    const a = pins[i - 1], b = pins[i]
    const below = boxes[i - 1].top + boxes[i - 1].height, above = boxes[i].top
    const gap = (below + above) / 2
    const from = Math.max(a.y, below - 12), to = Math.min(b.y, above + 12)
    segs.push(`L ${r(a.x)} ${r(from)} C ${r(a.x)} ${r(gap)} ${r(b.x)} ${r(gap)} ${r(b.x)} ${r(to)} L ${r(b.x)} ${r(b.y)}`)
  }
  const start = `M ${r(pins[0].x)} 0 `
  const last = pins[pins.length - 1]
  return {
    pins,
    road: start + segs.join(' ') + ` L ${r(last.x)} ${r(bottom)}`, // lead-out to the finish
    travelled: current < 0 ? '' : start + segs.slice(0, current + 1).join(' '),
    height: bottom,
  }
}
