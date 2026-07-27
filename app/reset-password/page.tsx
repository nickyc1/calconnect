'use client'

import { createBrowserClient } from '@supabase/ssr'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

/**
 * /reset-password — user lands here from the email reset link.
 *
 * Supabase's reset email includes a token in the URL fragment (#access_token=...).
 * When the browser client loads, Supabase's auth listener automatically
 * exchanges that token for a recovery session. From that recovery session
 * we're allowed to call updateUser({ password }) once to set a new password.
 *
 * If the fragment isn't present (someone visited this URL directly), we show
 * an error and link back to /forgot-password.
 */
export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [state, setState] = useState<'idle' | 'submitting' | 'success' | 'error' | 'invalid_link'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const router = useRouter()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  useEffect(() => {
    // Supabase auto-exchanges the recovery token in the URL fragment. We
    // listen for the PASSWORD_RECOVERY event (or any session that appears),
    // AND we poll getSession() every 300ms up to 5 seconds. Whichever wins
    // marks the page ready. If neither fires within 5s, we show
    // "invalid_link".
    //
    // Earlier version used a single 400ms timeout which raced with Supabase's
    // token exchange and false-triggered "Link expired" for valid links.
    let done = false
    let intervalId: ReturnType<typeof setInterval> | null = null

    const markReady = () => {
      if (done) return
      done = true
      if (intervalId) clearInterval(intervalId)
      setReady(true)
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        markReady()
      }
    })

    // Also poll — some browser/URL-fragment races fire the auth event before
    // React attaches the listener. getSession catches those.
    intervalId = setInterval(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) markReady()
    }, 300)

    // Fallback: after 5s if we still have no session, declare the link expired.
    const fallback = setTimeout(async () => {
      if (done) return
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setState('invalid_link')
      }
      markReady()
    }, 5000)

    return () => {
      clearTimeout(fallback)
      if (intervalId) clearInterval(intervalId)
      sub.subscription.unsubscribe()
    }
  }, [supabase])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')

    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.')
      return
    }

    setState('submitting')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setState('error')
      setErrorMsg(error.message)
      return
    }

    setState('success')
    setTimeout(() => router.push('/dashboard'), 1500)
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f5f5f5',
      padding: '1rem',
    }}>
      <div style={{
        background: 'white',
        padding: '2rem',
        borderRadius: '8px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        width: '100%',
        maxWidth: '440px',
        textAlign: 'center',
      }}>
        {!ready ? (
          <p style={{ color: '#666' }}>Verifying reset link…</p>
        ) : state === 'invalid_link' ? (
          <>
            <h1 style={{ marginBottom: '0.5rem', fontSize: '1.5rem' }}>Link expired</h1>
            <p style={{ color: '#4a4a45', marginBottom: '1.5rem', lineHeight: 1.55 }}>
              This password reset link is invalid or has expired. Reset links are only good for 1 hour.
            </p>
            <Link
              href="/forgot-password"
              style={{
                display: 'inline-block',
                padding: '0.7rem 1.4rem',
                background: '#14140f',
                color: '#f7f5ee',
                textDecoration: 'none',
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              Request a new link
            </Link>
          </>
        ) : state === 'success' ? (
          <>
            <h1 style={{ marginBottom: '0.5rem', fontSize: '1.5rem' }}>Password updated</h1>
            <p style={{ color: '#4a4a45', marginBottom: '1.5rem' }}>Signing you in…</p>
          </>
        ) : (
          <>
            <h1 style={{ marginBottom: '0.5rem', fontSize: '1.5rem' }}>Set a new password</h1>
            <p style={{ color: '#666', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
              Pick something at least 8 characters.
            </p>

            {errorMsg && (
              <div style={{
                background: '#fee', color: '#c00', padding: '0.75rem',
                borderRadius: 4, marginBottom: '1rem', fontSize: '0.9rem',
              }}>
                {errorMsg}
              </div>
            )}

            <form onSubmit={submit} style={{ textAlign: 'left' }}>
              <label style={{ display: 'block', fontSize: 13, color: '#555', marginBottom: 4 }}>New password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                autoFocus
                disabled={state === 'submitting'}
                style={{
                  width: '100%', padding: '0.6rem 0.75rem', boxSizing: 'border-box',
                  border: '1px solid #d5d3ce', borderRadius: 6, fontSize: 14, marginBottom: 12,
                }}
              />
              <label style={{ display: 'block', fontSize: 13, color: '#555', marginBottom: 4 }}>Confirm new password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                disabled={state === 'submitting'}
                style={{
                  width: '100%', padding: '0.6rem 0.75rem', boxSizing: 'border-box',
                  border: '1px solid #d5d3ce', borderRadius: 6, fontSize: 14,
                }}
              />
              <button
                type="submit"
                disabled={state === 'submitting' || !password || !confirmPassword}
                style={{
                  width: '100%', marginTop: 16, padding: '0.7rem 1rem',
                  background: '#14140f', color: '#f7f5ee', border: 'none', borderRadius: 6,
                  fontSize: 14, fontWeight: 500,
                  cursor: (state === 'submitting' || !password || !confirmPassword) ? 'not-allowed' : 'pointer',
                  opacity: (state === 'submitting' || !password || !confirmPassword) ? 0.55 : 1,
                }}
              >
                {state === 'submitting' ? 'Updating…' : 'Set new password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
