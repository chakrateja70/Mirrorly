import { useMutation } from '@tanstack/react-query'
import { Eye, EyeOff } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { api, queryClient, type User } from '../api'
import ThemeToggle from '../ThemeToggle'
import { useMe } from './useMe'

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD', 'JPY']

function PasswordInput({ isNew }: { isNew: boolean }) {
  const [show, setShow] = useState(false)
  return (
    <div className="pw">
      <input
        name="password" type={show ? 'text' : 'password'} required minLength={isNew ? 8 : undefined}
        autoComplete={isNew ? 'new-password' : 'current-password'}
      />
      <button type="button" className="pw-toggle" aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} onClick={() => setShow(!show)}>
        {show ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
      </button>
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
    <main className="auth">
      <div className="auth-theme"><ThemeToggle /></div>
      <div className="auth-logo">
        <img className="logo-light" src="/logo-light.webp" alt="Mirrorly" width={768} height={610} />
        <img className="logo-dark" src="/logo-dark.webp" alt="Mirrorly" width={768} height={610} />
      </div>
      <h1>{isLogin ? 'Welcome back' : 'Create your Mirrorly'}</h1>
      <form onSubmit={onSubmit} className="stack">
        {!isLogin && (
          <label>
            Name
            <input name="name" required maxLength={100} autoComplete="name" />
          </label>
        )}
        <label>
          Email
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label>
          Password
          <PasswordInput isNew={!isLogin} />
        </label>
        {!isLogin && (
          <label>
            Currency
            <select name="currency" defaultValue="INR">
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
        )}
        {submit.error && <p className="error" role="alert">{submit.error.message}</p>}
        <button className="primary" disabled={submit.isPending}>
          {submit.isPending ? 'Please wait…' : isLogin ? 'Log in' : 'Sign up'}
        </button>
      </form>
      <p className="muted">
        {isLogin ? <>New here? <Link to="/register">Create an account</Link></> : <>Have an account? <Link to="/login">Log in</Link></>}
      </p>
    </main>
  )
}
