import { lazy, Suspense, type ComponentProps } from 'react'

const Inner = lazy(() => import('./calendar').then((m) => ({ default: m.Calendar })))

/** The shadcn Calendar, loaded on first open: react-day-picker + date-fns stay out of the first page load.
 *  The fallback holds the calendar's size so the popover doesn't jump. */
export function Calendar(props: ComponentProps<typeof Inner>) {
  return (
    <Suspense fallback={<div className="h-[19rem] w-[15.5rem] animate-pulse rounded-xl bg-muted/50" />}>
      <Inner {...props} />
    </Suspense>
  )
}
