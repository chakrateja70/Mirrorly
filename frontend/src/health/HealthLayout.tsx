import { ChartLine, Route, Sun, UserRound } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SkeletonList } from '../Skeleton'
import Onboarding from './Onboarding'
import { useHealthProfile } from './queries'

const TABS = [
  { to: '/health', end: true, Icon: Sun, label: 'Today' },
  { to: '/health/journey', end: false, Icon: Route, label: 'Journey' },
  { to: '/health/trends', end: false, Icon: ChartLine, label: 'Trends' },
  { to: '/health/profile', end: false, Icon: UserRound, label: 'Profile' },
]

/** Food & Health: onboarding until there's a profile, then its views as a segmented control (like Expenses). */
export default function HealthLayout() {
  const profile = useHealthProfile()
  return (
    <section>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Food & Health</h1>
      {profile.isPending ? <SkeletonList label="Loading your profile" rows={4} />
        : profile.isError ? (
          <div className="grid justify-items-start gap-3 text-destructive">{profile.error.message} <Button variant="secondary" onClick={() => profile.refetch()}>Retry</Button></div>
        ) : !profile.data ? <Onboarding />
          : (
            <>
              <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-[19] -mx-4 mb-5 bg-background/75 px-4 py-2 backdrop-blur-xl lg:static lg:mx-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
                <nav className="flex w-full rounded-xl bg-muted p-1 sm:w-fit" aria-label="Food & Health views">
                  {TABS.map(({ to, end, Icon, label }) => (
                    <NavLink
                      key={to} to={to} end={end}
                      className={({ isActive }) => cn(
                        'flex h-9 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground sm:flex-none sm:px-4',
                        isActive && 'bg-card text-foreground shadow-sm',
                      )}
                    >
                      <Icon className="hidden size-4 sm:block" aria-hidden />
                      <span>{label}</span>
                    </NavLink>
                  ))}
                </nav>
              </div>
              <Outlet context={profile.data} />
            </>
          )}
    </section>
  )
}
