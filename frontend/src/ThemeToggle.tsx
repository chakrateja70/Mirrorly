import { Monitor, Moon, Sun } from 'lucide-react'
import { useState } from 'react'

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

/** Light / Dark / System. Pins `data-theme` on <html> (index.html re-applies it before first paint). */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(saved)

  const choose = (t: Theme) => {
    setTheme(t)
    if (t === 'system') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = t
    try {
      if (t === 'system') localStorage.removeItem('theme')
      else localStorage.setItem('theme', t)
    } catch {
      /* not persisted; still applies for this visit */
    }
  }

  return (
    <div className="seg" role="group" aria-label="Theme">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button key={value} type="button" title={label} aria-label={label} aria-pressed={theme === value} onClick={() => choose(value)}>
          <Icon size={16} aria-hidden /> <span>{label}</span>
        </button>
      ))}
    </div>
  )
}
