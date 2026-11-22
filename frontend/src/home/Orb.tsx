import { Bot } from 'lucide-react'
import { cn } from '@/lib/utils'

/** The assistant's face: a glossy gradient orb that slowly turns (still when reduced motion is on). */
const Orb = ({ className }: { className?: string }) => (
  <span className={cn('relative isolate grid place-items-center overflow-hidden rounded-full shadow-lg shadow-violet-500/30', className)} aria-hidden>
    <span className="absolute -inset-1/4 -z-10 animate-[spin_7s_linear_infinite] bg-[conic-gradient(#6366f1,#a855f7,#ec4899,#22d3ee,#6366f1)] motion-reduce:animate-none" />
    <span className="absolute inset-x-[18%] top-[8%] -z-10 h-[38%] rounded-full bg-white/35 blur-[3px]" />
    <Bot className="size-[52%] text-white drop-shadow-[0_1px_2px_rgb(0_0_0/0.35)]" />
  </span>
)
export default Orb
