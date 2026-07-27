'use client'

import { createBrowserClient } from '@supabase/ssr'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Suspense, useEffect, useState } from 'react'

// Allowed paths we'll redirect to after login. Prefix match (so /redeem?code=…
// still works). Never allow protocol-relative // — that's an open-redirect vector.
const ALLOWED_NEXT_PREFIXES = ['/dashboard', '/redeem', '/onboarding']
function safeNext(raw: string): string {
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/dashboard'
  return ALLOWED_NEXT_PREFIXES.some(p => raw === p || raw.startsWith(p + '?') || raw.startsWith(p + '#'))
    ? raw
    : '/dashboard'
}

// Next.js 14 requires useSearchParams() to sit inside a Suspense boundary
// during static prerender. Wrap the real page content in one.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  )
}

function LoginContent() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'google' | 'email'>('google')
  // Read cc_last_auth cookie set by /auth/callback (google) or submitEmailLogin
  // (email). Used to nudge the user toward whichever method they used last.
  const [lastAuth, setLastAuth] = useState<'google' | 'email' | null>(null)
  useEffect(() => {
    if (typeof document === 'undefined') return
    const match = document.cookie.match(/(?:^|;\s*)cc_last_auth=([^;]+)/)
    if (match && (match[1] === 'google' || match[1] === 'email')) {
      setLastAuth(match[1] as 'google' | 'email')
    }
  }, [])
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const rawNext = searchParams.get('next') || ''
  const next = safeNext(rawNext)

  // Login page is login-only now. New-account creation happens on /signup.
  // The /redeem next-param stays supported for AppSumo buyers signing in
  // to an existing account to redeem their code.
  const heading = 'Welcome back'
  const subheading = next === '/redeem'
    ? 'Sign in with Google to redeem your AppSumo code.'
    : 'Sign in to your CalConnect account.'
  const buttonLabel = 'Sign in with Google'
  const buttonLabelLoading = 'Signing in…'
  const consent = 'By signing in, you agree to connect your Google Calendar accounts.'

  const handleGoogleLogin = async () => {
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    }
  }

  const submitEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || password.length < 1) return
    setLoading(true)
    setError(null)
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }
    // Remember this login method so next visit can nudge toward email again.
    document.cookie = `cc_last_auth=email; max-age=${60 * 60 * 24 * 180}; path=/; SameSite=Lax`
    router.push(next)
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f5f5f5'
    }}>
      <div style={{
        background: 'white',
        padding: '2rem',
        borderRadius: '8px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        width: '100%',
        maxWidth: '400px',
        textAlign: 'center'
      }}>
        <h1 style={{ marginBottom: '0.5rem' }}>{heading}</h1>
        <p style={{ color: '#666', marginBottom: '2rem' }}>{subheading}</p>

        {error && (
          <div style={{
            background: '#fee',
            color: '#c00',
            padding: '0.75rem',
            borderRadius: '4px',
            marginBottom: '1rem'
          }}>
            {error}
          </div>
        )}

        <button
          onClick={() => { setMode('google'); handleGoogleLogin() }}
          disabled={loading}
          style={{
            width: '100%',
            padding: '0.75rem 1rem',
            background: '#4285f4',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '1rem',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
            position: 'relative',
          }}
        >
          {loading && mode === 'google' ? buttonLabelLoading : buttonLabel}
        </button>
        {lastAuth === 'google' && !loading && (
          <div style={{
            marginTop: 6, fontSize: 12, color: '#1e5f22', fontWeight: 500,
          }}>
            ✓ You used Google last time
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '1.25rem 0', color: '#999', fontSize: 12 }}>
          <div style={{ flex: 1, height: 1, background: '#e5e5e5' }} />
          <span>or</span>
          <div style={{ flex: 1, height: 1, background: '#e5e5e5' }} />
        </div>

        <form onSubmit={submitEmailLogin} style={{ textAlign: 'left' }}>
          <label style={{ display: 'block', fontSize: 13, color: '#555', marginBottom: 4 }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setMode('email') }}
            autoComplete="email"
            placeholder="you@example.com"
            disabled={loading}
            style={{
              width: '100%', padding: '0.6rem 0.75rem', boxSizing: 'border-box',
              border: '1px solid #d5d3ce', borderRadius: 6, fontSize: 14, marginBottom: 12,
            }}
          />
          <label style={{ display: 'block', fontSize: 13, color: '#555', marginBottom: 4 }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setMode('email') }}
            autoComplete="current-password"
            disabled={loading}
            style={{
              width: '100%', padding: '0.6rem 0.75rem', boxSizing: 'border-box',
              border: '1px solid #d5d3ce', borderRadius: 6, fontSize: 14,
            }}
          />
          <div style={{ marginTop: 6, textAlign: 'right' }}>
            <Link href="/forgot-password" style={{ fontSize: 12, color: '#8a887f', textDecoration: 'underline' }}>Forgot password?</Link>
          </div>
          {lastAuth === 'email' && (
            <div style={{ marginTop: 6, fontSize: 12, color: '#1e5f22', fontWeight: 500 }}>
              ✓ You used email last time
            </div>
          )}
          <button
            type="submit"
            disabled={loading || !email.trim() || !password}
            style={{
              width: '100%', marginTop: 12, padding: '0.7rem 1rem',
              background: '#14140f', color: '#f7f5ee', border: 'none', borderRadius: 6,
              fontSize: 14, fontWeight: 500,
              cursor: (loading || !email.trim() || !password) ? 'not-allowed' : 'pointer',
              opacity: (loading || !email.trim() || !password) ? 0.55 : 1,
            }}
          >
            {loading && mode === 'email' ? 'Signing in…' : 'Sign in with email'}
          </button>
        </form>

        <p style={{ marginTop: '1.5rem', fontSize: '0.85rem', color: '#4a4a45' }}>
          New here? <Link href="/signup" style={{ color: '#de5b28', textDecoration: 'underline' }}>Create an account</Link>
        </p>

        <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#999' }}>{consent}</p>
      </div>
    </div>
  )
}
