import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'

import { supabase } from '../../services/api/supabaseClient'

import './AuthGate.css'

const useMockApi = import.meta.env.VITE_USE_MOCK_API !== 'false'

interface AuthGateProps {
  children: (session: Session | null) => ReactNode
}

/**
 * Owns the single Supabase session subscription for the React application.
 * Mock mode deliberately bypasses this gate so local demos remain credential-free.
 */
export function AuthGate({ children }: AuthGateProps) {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(!useMockApi)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (useMockApi || !supabase) return

    let active = true

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return
      setSession(data.session)
      setError(sessionError?.message ?? null)
      setIsLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        if (active) setSession(nextSession)
      },
    )

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  if (useMockApi) return <>{children(null)}</>

  if (!supabase) {
    return (
      <main className="auth-gate" aria-label="Authentication required">
        <section className="auth-card">
          <span className="section-kicker">VIDEOMIND AI</span>
          <h1>Authentication is not configured</h1>
          <p>
            Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to use the authenticated backend.
          </p>
        </section>
      </main>
    )
  }

  if (isLoading) {
    return <main className="auth-gate" role="status">Restoring your session…</main>
  }

  if (session) return <>{children(session)}</>

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return

    setIsSubmitting(true)
    setError(null)
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setIsSubmitting(false)

    if (signInError) setError(signInError.message)
  }

  return (
    <main className="auth-gate" aria-label="Sign in">
      <section className="auth-card">
        <span className="section-kicker">VIDEOMIND AI</span>
        <h1>Continue your learning</h1>
        <p>Sign in to access your personal video library.</p>
        <form onSubmit={handleSubmit} className="auth-form">
          <label htmlFor="auth-email">Email</label>
          <input id="auth-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={isSubmitting} />
          <label htmlFor="auth-password">Password</label>
          <input id="auth-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={isSubmitting} />
          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        {error && <p className="error-message" role="alert">{error}</p>}
      </section>
    </main>
  )
}
