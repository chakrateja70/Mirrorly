import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'

const WIDTHS = ['62%', '45%', '78%', '54%', '70%', '40%', '66%', '50%'] // varied so rows don't look cloned

/** Placeholder in the shape of what's loading; screen readers hear the label instead. */
export function Loading({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="status">
      <span className="sr-only">{label}</span>
      <div aria-hidden>{children}</div>
    </div>
  )
}

export const SkeletonList = ({ label, rows = 6 }: { label: string; rows?: number }) => (
  <Loading label={label}>
    <Card className="gap-0 overflow-hidden py-1">
      <ul className="divide-y divide-border/60">
        {WIDTHS.slice(0, rows).map((w, i) => (
          <li key={i} className="flex items-center gap-3 px-4 py-3">
            <span className="skel dot" />
            <span className="grid flex-1">
              <span className="skel" style={{ width: w }} />
              <span className="skel sm" style={{ width: '30%' }} />
            </span>
            <span className="skel w-18" />
          </li>
        ))}
      </ul>
    </Card>
  </Loading>
)

/** Analytics page: KPI tiles and chart cards. Shared by the route's lazy-chunk fallback and the data load. */
export const ChartsSkeleton = () => (
  <Loading label="Loading charts">
    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {WIDTHS.slice(0, 4).map((w, i) => (
        <Card key={i} className="gap-1 p-4">
          <span className="skel dot" />
          <span className="skel sm mt-2" style={{ width: '55%' }} />
          <span className="skel text-2xl" style={{ width: w }} />
          <span className="skel sm" style={{ width: '40%' }} />
        </Card>
      ))}
    </div>
    <div className="grid gap-4 md:grid-cols-2">
      {[0, 1].map((i) => (
        <Card key={i} className="gap-4 p-5">
          <span className="skel" style={{ width: '40%' }} />
          <span className="skel" style={{ height: 220 }} />
        </Card>
      ))}
    </div>
  </Loading>
)
