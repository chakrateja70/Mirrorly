import { useMutation } from '@tanstack/react-query'
import { Clock, HeartPulse, Salad, Target, User, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { api, type HealthProfile } from '../api'
import { ProfileSection } from './ProfileFields'
import { DISCLAIMER, missing, summary, toForm, toProfile, type ProfileForm, type Section } from './profileForm'
import { refreshHealth } from './queries'
import { Fold } from './ui'

const SECTIONS: [Section, string, LucideIcon, string][] = [
  ['about', 'About you', User, 'bg-violet-500/15 text-violet-600 dark:text-violet-300'],
  ['routine', 'Your day', Clock, 'bg-sky-500/15 text-sky-600 dark:text-sky-300'],
  ['food', 'Your food', Salad, 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'],
  ['lifestyle', 'Your habits', HeartPulse, 'bg-rose-500/15 text-rose-600 dark:text-rose-300'],
  ['goals', 'Your goals', Target, 'bg-amber-500/15 text-amber-600 dark:text-amber-300'],
]

/** Everything onboarding asked, each section in a fold. Changes shape the next plan you make. */
export default function ProfilePage() {
  const profile = useOutletContext<HealthProfile>()
  const [f, setF] = useState<ProfileForm>(() => toForm(profile))
  const [open, setOpen] = useState<Section | null>('about')
  const [problem, setProblem] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: () => api<HealthProfile>('/wellness/profile', { method: 'PUT', body: toProfile(f) }),
    onSuccess: () => refreshHealth(true),
  })
  const set = (patch: Partial<ProfileForm>) => { setF((old) => ({ ...old, ...patch })); setProblem(null); save.reset() }

  return (
    <form
      className="mx-auto grid max-w-2xl gap-3"
      onInvalidCapture={(e) => { // a required input inside a closed fold: open that fold so the browser can point at it
        const fold = (e.target as HTMLElement).closest('details')
        if (fold && !fold.open) fold.open = true
      }}
      onSubmit={(e) => {
        e.preventDefault()
        const hit = SECTIONS.find(([s]) => missing(f, s))
        if (hit) { setProblem(missing(f, hit[0])); setOpen(hit[0]) } else save.mutate()
      }}
    >
      <p className="text-xs text-muted-foreground">Tap a section to edit it. <span className="text-destructive">*</span> required</p>
      {SECTIONS.map(([s, title, Icon, tint]) => (
        <Fold key={s} Icon={Icon} tint={tint} title={title} summary={summary(f, s)} open={open === s} onOpenChange={(o) => o ? setOpen(s) : open === s && setOpen(null)}>
          <ProfileSection section={s} f={f} set={set} />
        </Fold>
      ))}
      <p className="text-xs text-muted-foreground">{DISCLAIMER}</p>
      {/* stays reachable at the bottom of the screen while scrolling a long form */}
      <div className="sticky bottom-[max(1rem,env(safe-area-inset-bottom))] flex items-center gap-3 rounded-2xl bg-card/90 p-2 pl-4 shadow-card backdrop-blur">
        <span className="flex-1 text-sm" role="status">
          {problem ? <span className="text-destructive">{problem}</span>
            : save.error ? <span className="text-destructive">{save.error.message}</span>
              : save.isSuccess ? 'Saved. Your next plan uses it.' : <span className="text-muted-foreground">Changes apply to your next plan.</span>}
        </span>
        <Button disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</Button>
      </div>
    </form>
  )
}
