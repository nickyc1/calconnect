'use client'

import Link from 'next/link'
import { useState } from 'react'

/**
 * /forgot-password — user enters email, we look up their identity method,
 * and either (a) trigger a reset email if they have a password, or
 * (b) redirect them toward Google sign-in if they only have a Google identity.
 *
 * We never surface whether a specific email is "known" — attackers can't use
 * this page to enumerate accounts. The Google nudge does leak that specific
 * emails use Google, which is a small trade-off for real UX (Michal on
 * AppSumo hit this exact wall).
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'submitting' | 'email_sent' | 'use_google' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setState('submitting')
    setErrorMsg('')

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setState('error')
        setErrorMsg(data?.error || 'Something went wrong. Try again.')
        return
      }

      setState(data.result === 'use_google' ? 'use_google' : 'email_sent')
    } catch (err: any) {
      setState('error')
      setErrorMsg(err?.message || 'Something went wrong. Try again.')
    }
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
        {state === 'email_sent' ? (
          <>
            <h1 style={{ marginBottom: '0.5rem', fontSize: '1.5rem' }}>Check your email</h1>
            <p style={{ color: '#4a4a45', marginBottom: '1.5rem', lineHeight: 1.55 }}>
              If <strong>{email}</strong> is a CalConnect account with a password, we&apos;ve sent a reset link.
              It expires in 1 hour.
            </p>
            <p style={{ color: '#8a887f', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              Didn&apos;t get it? Check your spam folder, or try again with a different email.
            </p>
            <Link href="/login" style={{ color: '#666', fontSize: '0.9rem', textDecoration: 'underline' }}>← Back to sign in</Link>
          </>
        ) : state === 'use_google' ? (
          <>
            <h1 style={{ marginBottom: '0.5rem', fontSize: '1.5rem' }}>You signed in with Google</h1>
            <p style={{ color: '#4a4a45', marginBottom: '1.5rem', lineHeight: 1.55 }}>
              <strong>{email}</strong> is registered with Google sign-in, not a password. There&apos;s no password to reset — just click the Google button on the sign-in page.
            </p>
            <Link
              href="/login"
              style={{
                display: 'inline-block',
                padding: '0.75rem 1.5rem',
                background: '#4285f4',
                color: 'white',
                textDecoration: 'none',
                borderRadius: 6,
                fontWeight: 500,
                fontSize: 14,
              }}
            >
              Continue to sign in
            </Link>
          </>
        ) : (
          <>
            <h1 style={{ marginBottom: '0.5rem', fontSize: '1.5rem' }}>Forgot your password?</h1>
            <p style={{ color: '#666', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
              Enter your email and we&apos;ll send you a reset link.
            </p>

            {state === 'error' && errorMsg && (
              <div style={{
                background: '#fee', color: '#c00', padding: '0.75rem',
                borderRadius: 4, marginBottom: '1rem', fontSize: '0.9rem',
              }}>
                {errorMsg}
              </div>
            )}

            <form onSubmit={submit} style={{ textAlign: 'left' }}>
              <label style={{ display: 'block', fontSize: 13, color: '#555', marginBottom: 4 }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
                placeholder="you@example.com"
                disabled={state === 'submitting'}
                style={{
                  width: '100%', padding: '0.6rem 0.75rem', boxSizing: 'border-box',
                  border: '1px solid #d5d3ce', borderRadius: 6, fontSize: 14,
                }}
              />
              <button
                type="submit"
                disabled={state === 'submitting' || !email.trim()}
                style={{
                  width: '100%', marginTop: 16, padding: '0.7rem 1rem',
                  background: '#14140f', color: '#f7f5ee', border: 'none', borderRadius: 6,
                  fontSize: 14, fontWeight: 500,
                  cursor: (state === 'submitting' || !email.trim()) ? 'not-allowed' : 'pointer',
                  opacity: (state === 'submitting' || !email.trim()) ? 0.55 : 1,
                }}
              >
                {state === 'submitting' ? 'Sending…' : 'Send reset link'}
              </button>
            </form>

            <p style={{ marginTop: '1.25rem', fontSize: '0.85rem', color: '#666' }}>
              Remember your password? <Link href="/login" style={{ color: '#de5b28', textDecoration: 'underline' }}>Sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
