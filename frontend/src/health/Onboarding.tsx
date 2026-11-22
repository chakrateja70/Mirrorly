import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Clock, HeartPulse, Salad, Target, User } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { api, today } from '../api'
import { useMe } from '../auth/useMe'
import { ProfileSection } from './ProfileFields'
import { DISCLAIMER, missing, suggestedWater, toForm, toProfile, type ProfileForm, type Section } from './profileForm'
import { refreshHealth } from './queries'

const STEPS: { section: Section; title: string; sub: string; Icon: typeof User; optional?: boolean }[] = [
  { section: 'about', title: 'About you', sub: 'Your body sets your sleep, calorie, protein and water needs.', Icon: User },
  { section: 'routine', title: 'Your day', sub: 'The plan fits around when you wake, work and sleep.', Icon: Clock },
  { section: 'food', title: 'Your food', sub: 'What you really eat, so suggestions stay realistic.', Icon: Salad },
  { section: 'lifestyle', title: 'Your habits', sub: 'Optional, but it sharpens every suggestion.', Icon: HeartPulse, optional: true },
  { section: 'goals', title: 'Your goals', sub: 'What you want to change first.', Icon: Target },
]

/** First visit: five short steps (one optional), then the coach builds a journey from it. */
export default function Onboarding() {
  const name = useMe().data?.name.split(' ')[0]
  const [step, setStep] = useState(0)
  const [f, setF] = useState<ProfileForm>(() => toForm(null))
  const [waterTouched, setWaterTouched] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const set = (patch: Partial<ProfileForm>) => {
    if ('water_goal_ml' in patch) setWaterTouched(true)
    setF((old) => ({ ...old, ...patch, ...('weight_kg' in patch && !waterTouched ? { water_goal_ml: suggestedWater(patch.weight_kg!) ?? old.water_goal_ml } : {}) }))
    setProblem(null)
  }

  const finish = useMutation({
    mutationFn: async () => {
      await api('/wellness/profile', { method: 'PUT', body: toProfile(f) })
      // the journey needs the model; if that fails the profile is still saved and it can be made later
      await api('/wellness/journey', { method: 'POST', body: { day: today() } }).catch(() => {})
    },
    onSuccess: () => refreshHealth(true),
  })

  const { section, title, sub, Icon, optional } = STEPS[step]
  const last = step === STEPS.length - 1
  const next = () => { setStep(step + 1); scrollTo({ top: 0 }) }
  return (
    <div className="mx-auto grid max-w-2xl gap-5">
      <div className="grid gap-1">
        <p className="text-sm font-medium text-primary">Hi {name}, let's set up your coach</p>
        <p className="text-sm text-muted-foreground">About three minutes. After this you'll get a daily plan built around your routine and food.</p>
      </div>
      <ol className="grid grid-cols-5 gap-2" aria-label="Setup steps">
        {STEPS.map((s, i) => (
          <li key={s.section} className="grid gap-1.5" aria-current={i === step ? 'step' : undefined}>
            <span className={cn('h-1.5 rounded-full transition-colors', i < step ? 'bg-primary' : i === step ? 'bg-primary/60' : 'bg-muted')} />
            <span className={cn('hidden text-xs sm:block', i === step ? 'font-medium text-foreground' : 'text-muted-foreground')}>{s.title}</span>
          </li>
        ))}
      </ol>
      <Card className="gap-5 px-5 py-5 sm:px-6">
        <form
          className="grid gap-6"
          onSubmit={(e) => {
            e.preventDefault()
            const why = missing(f, section)
            if (why) return setProblem(why)
            if (last) finish.mutate()
            else next()
          }}
        >
          <header className="flex items-start gap-3">
            <span className="grid size-11 flex-none place-items-center rounded-2xl bg-linear-135 from-emerald-400 to-teal-600 text-white shadow-md" aria-hidden><Icon className="size-5.5" /></span>
            <div className="grid gap-0.5">
              <h2 className="text-lg font-semibold tracking-tight">{title} <span className="text-sm font-normal text-muted-foreground">· step {step + 1} of {STEPS.length}</span></h2>
              <p className="text-sm text-muted-foreground">{sub}</p>
              {!optional && <p className="text-xs text-muted-foreground"><span className="text-destructive">*</span> required</p>}
            </div>
          </header>
          <ProfileSection section={section} f={f} set={set} />
          {last && <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">{DISCLAIMER}</p>}
          {(problem || finish.error) && <p className="text-sm text-destructive" role="alert">{problem ?? finish.error?.message}</p>}
          <div className="flex gap-2">
            {step > 0 && <Button type="button" variant="ghost" onClick={() => setStep(step - 1)} disabled={finish.isPending}><ArrowLeft aria-hidden /> Back</Button>}
            <span className="flex-1" />
            {optional && <Button type="button" variant="ghost" onClick={next}>Skip</Button>}
            <Button size="lg" disabled={finish.isPending}>
              {last ? (finish.isPending ? 'Building your plan…' : 'Build my plan') : <>Next <ArrowRight aria-hidden /></>}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
