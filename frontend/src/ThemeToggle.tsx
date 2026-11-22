import { Monitor, Moon, Sun } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

type Theme = 'light' | 'dark' | 'system'
const OPTIONS = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
] as const

function saved(): Theme {
  try {
    const t = localStorage.getItem('theme')
    return t === 'light' || t === 'dark' ? t : 'system'
  } catch {
    return 'system'
  }
}

/** Light / Dark / System. Toggles .dark on <html> (index.html applies the saved choice before first paint
 *  and keeps "System" in step with the OS). */
export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>(saved)

  const choose = (t: Theme) => {
    setTheme(t)
    try {
      if (t === 'system') localStorage.removeItem('theme')
      else localStorage.setItem('theme', t)
    } catch {
      /* not persisted; still applies for this visit */
    }
    document.documentElement.classList.toggle('dark', t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches))
  }

  return (
    <div className="flex gap-0.5 rounded-xl bg-muted p-1" role="group" aria-label="Theme">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value} type="button" title={label} aria-label={label} aria-pressed={theme === value} onClick={() => choose(value)}
          className={cn(
            'flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground',
            'aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-sm',
          )}
        >
          <Icon className="size-4" aria-hidden /> {!compact && <span>{label}</span>}
        </button>
      ))}
    </div>
  )
}
