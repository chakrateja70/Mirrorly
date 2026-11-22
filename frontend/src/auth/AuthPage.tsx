import { useMutation } from '@tanstack/react-query'
import { Eye, EyeOff } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { api, queryClient, type User } from '../api'
import ThemeToggle from '../ThemeToggle'
import { useMe } from './useMe'

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD', 'JPY']

function PasswordInput({ isNew }: { isNew: boolean }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input
        id="password" name="password" type={show ? 'text' : 'password'} required minLength={isNew ? 8 : undefined}
        autoComplete={isNew ? 'new-password' : 'current-password'} className="h-11 pr-11"
      />
      <Button
        type="button" variant="ghost" size="icon" className="absolute top-1/2 right-0.5 -translate-y-1/2 text-muted-foreground"
        aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} onClick={() => setShow(!show)}
      >
        {show ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
      </Button>
    </div>
  )
}

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const me = useMe()
  const submit = useMutation({
    mutationFn: (body: Record<string, FormDataEntryValue>) => api<User>(`/auth/${mode}`, { method: 'POST', body }),
    onSuccess: (user) => queryClient.setQueryData(['me'], user),
  })

  if (me.data) return <Navigate to="/" replace />

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    submit.mutate(Object.fromEntries(new FormData(e.currentTarget)))
  }
  const isLogin = mode === 'login'

  return (
    <main className="mx-auto grid min-h-dvh max-w-sm content-center gap-6 px-4 py-12">
      <div className="fixed top-3 right-3"><ThemeToggle compact /></div>
      <div className="grid justify-items-center">
        <img className="logo-light h-auto w-[min(200px,55vw)]" src="/logo-light.webp" alt="Mirrorly" width={768} height={610} />
        <img className="logo-dark h-auto w-[min(200px,55vw)]" src="/logo-dark.webp" alt="Mirrorly" width={768} height={610} />
      </div>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl"><h1>{isLogin ? 'Welcome back' : 'Create your Mirrorly'}</h1></CardTitle>
          <CardDescription>{isLogin ? 'Log in to see your spending.' : 'Track everything about your life, expenses first.'}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-4">
            {!isLogin && (
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" required maxLength={100} autoComplete="name" className="h-11" />
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required autoComplete="email" className="h-11" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <PasswordInput isNew={!isLogin} />
            </div>
            {!isLogin && (
              <div className="grid gap-2">
                <Label htmlFor="currency">Currency</Label>
                <Select name="currency" defaultValue="INR">
                  <SelectTrigger id="currency" className="h-11 w-full data-[size=default]:h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {submit.error && <p className="text-sm text-destructive" role="alert">{submit.error.message}</p>}
            <Button size="lg" className="mt-1 w-full" disabled={submit.isPending}>
              {submit.isPending ? 'Please wait…' : isLogin ? 'Log in' : 'Sign up'}
            </Button>
          </form>
        </CardContent>
      </Card>
      <p className="text-center text-sm text-muted-foreground">
        {isLogin
          ? <>New here? <Link className="font-medium text-primary hover:underline" to="/register">Create an account</Link></>
          : <>Have an account? <Link className="font-medium text-primary hover:underline" to="/login">Log in</Link></>}
      </p>
    </main>
  )
}
