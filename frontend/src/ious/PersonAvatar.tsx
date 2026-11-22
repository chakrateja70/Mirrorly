import { cn } from '@/lib/utils'

// a friend keeps the same color everywhere: picked from their name
const GRADIENTS = [
  'from-sky-400 to-indigo-500', 'from-emerald-400 to-teal-600', 'from-amber-400 to-orange-500',
  'from-pink-400 to-rose-500', 'from-violet-400 to-purple-600', 'from-cyan-400 to-blue-600',
]

export default function PersonAvatar({ name, small = false }: { name: string; small?: boolean }) {
  const hash = [...name.trim().toLowerCase()].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7)
  return (
    <span
      className={cn('grid flex-none place-items-center rounded-full bg-linear-135 font-semibold text-white', GRADIENTS[hash % GRADIENTS.length], small ? 'size-7 text-xs' : 'size-10')}
      aria-hidden
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}
