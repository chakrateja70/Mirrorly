import type { LucideProps } from 'lucide-react'
import { createElement } from 'react'
import { cn } from '@/lib/utils'
import type { Category } from '../../api'
import { categoryIcon } from './categoryIcon'

/** The icon for a category name (picked from a fixed table, see categoryIcon). */
export function CategoryIcon({ name, ...props }: { name?: string } & LucideProps) {
  return createElement(categoryIcon(name), props)
}

/** The category's icon on a soft wash of its color: the category reads at a glance without a legend. */
export default function CategoryAvatar({ cat, name, color, small = false }: { cat?: Category; name?: string; color?: string; small?: boolean }) {
  const c = cat?.color ?? color ?? 'var(--fold)'
  return (
    <span
      className={cn('grid flex-none place-items-center rounded-full', small ? 'size-6' : 'size-9')} aria-hidden
      style={{ color: c, background: `color-mix(in oklab, ${c} 16%, transparent)` }}
    >
      <CategoryIcon name={cat?.name ?? name} className={small ? 'size-3.5' : 'size-[1.125rem]'} />
    </span>
  )
}
