'use client'

import { createBrowserClient } from '@supabase/ssr'
import Link from 'next/link'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

/**
 * /redeem
 *
 * AppSumo code redemption flow — two screens by design:
 *   Screen 1: Enter your AppSumo code (unauthenticated OK)
 *   Screen 2: Create your CalConnect account (only if not signed in)
 *   Then: auto-claim + redirect to /dashboard as Lifetime plan
 *
 * If the buyer is already signed in, screen 2 is skipped and we claim
 * immediately after code validation.
 */

export default function RedeemPage() {
  return (
    <Suspense fallback={null}>
      <RedeemContent />
    </Suspense>
  )
}

type Screen = 'enter_code' | 'create_account' | 'processing' | 'success'

function RedeemContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  const [screen, setScreen] = useState<Screen>('enter_code')
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Signup form state
  const [firstName, setFirstName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signupMode, setSignupMode] = useState<'google' | 'email'>('google')

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const isIn = !!user
      setSignedIn(isIn)

      // Look for the code in URL first (fastest path), then localStorage
      // (survives if the OAuth roundtrip strips the query string).
      const urlCode = searchParams.get('code')
      const storedCode = typeof window !== 'undefined' ? localStorage.getItem('cc_redeem_code') : null
      const pendingCode = urlCode || storedCode

      if (pendingCode && isIn) {
        setCode(pendingCode.toUpperCase())
        setScreen('processing')
        localStorage.removeItem('cc_redeem_code')
        await claimCode(pendingCode)
      }
    })()
  }, [])

  const validateAndProceed = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const trimmed = code.trim().toUpperCase()
    try {
      const res = await fetch('/api/validate-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmed }),
      })
      const data = await res.json()
      if (!res.ok || !data?.valid) {
        setError(data?.error || 'That code is invalid or already redeemed.')
        setLoading(false)
        return
      }
      // Valid — either claim immediately (signed in) or move to account creation.
      if (signedIn) {
        setScreen('processing')
        await claimCode(trimmed)
      } else {
        setScreen('create_account')
        setLoading(false)
      }
    } catch (err: any) {
      setError(err?.message || 'Network error. Please try again.')
      setLoading(false)
    }
  }

  const claimCode = async (rawCode: string) => {
    setError('')
    try {
      const res = await fetch('/api/redeem-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: rawCode.trim() }),
      })
      const data = await res.json()
      if (res.ok && data?.success) {
        // Skip the success screen and drop the user directly into the dashboard
        // with a fresh "connect your first calendar" state waiting for them.
        router.replace('/dashboard?redeemed=1')
      } else {
        setError(data?.error || 'Could not redeem code. Please try again.')
        setScreen('enter_code')
      }
    } catch (err: any) {
      setError(err?.message || 'Network error')
      setScreen('enter_code')
    } finally {
      setLoading(false)
    }
  }

  const startGoogleSignup = async () => {
    setLoading(true)
    setSignupMode('google')
    setError('')
    // Persist the code across the OAuth roundtrip in localStorage in case the
    // URL query is stripped somewhere in the redirect chain.
    localStorage.setItem('cc_redeem_code', code.trim())
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(`/redeem?code=${code.trim()}`)}`,
      },
    })
    if (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  const submitEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!firstName.trim() || !email.trim() || password.length < 8) return
    setLoading(true)
    setSignupMode('email')
    setError('')

    const { data, error: signupError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: firstName.trim() } },
    })

    if (signupError) {
      setError(signupError.message)
      setLoading(false)
      return
    }

    if (!data?.session) {
      // Email confirmation is required. Tell them what to do.
      setError('Please confirm your email, then come back to this page to finish redeeming.')
      setLoading(false)
      return
    }

    // Signed in — claim the code now.
    await claimCode(code.trim())
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="rd-wrap">
        <div className="rd-card">
          <div className="rd-brand">Cal<em>Connect</em></div>

          {screen === 'enter_code' && (
            <>
              <h1 className="rd-title">Redeem your AppSumo code</h1>
              <p className="rd-sub">Paste the code from your AppSumo product page.</p>
              <form onSubmit={validateAndProceed}>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="AS-CALC-XXXXX-XXXXX"
                  className="rd-input"
                  autoFocus
                  spellCheck={false}
                  autoComplete="off"
                  maxLength={200}
                  disabled={loading}
                />
                <button
                  type="submit"
                  className="rd-btn"
                  disabled={loading || !code.trim()}
                >
                  {loading ? 'Checking…' : 'Continue'}
                </button>
              </form>
              {error && <div className="rd-msg rd-msg-err">{error}</div>}
              <p className="rd-help">
                Trouble redeeming? Email <a href="mailto:n.christensen4@gmail.com">n.christensen4@gmail.com</a> with your AppSumo receipt and the first 8 characters of your code.
              </p>
            </>
          )}

          {screen === 'create_account' && (
            <>
              <h1 className="rd-title">Create your account</h1>
              <p className="rd-sub">One quick step and your Lifetime plan is active. Your code will be redeemed automatically.</p>

              <button
                type="button"
                className="rd-btn rd-btn-outline"
                onClick={startGoogleSignup}
                disabled={loading}
              >
                {loading && signupMode === 'google' ? 'Redirecting…' : 'Continue with Google'}
              </button>

              <div className="rd-divider"><span>or</span></div>

              <form onSubmit={submitEmailSignup}>
                <label className="rd-label">First name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="rd-input rd-input-plain"
                  placeholder="Nick"
                  autoComplete="given-name"
                  disabled={loading}
                />
                <label className="rd-label" style={{ marginTop: 12 }}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rd-input rd-input-plain"
                  placeholder="you@example.com"
                  autoComplete="email"
                  disabled={loading}
                />
                <label className="rd-label" style={{ marginTop: 12 }}>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rd-input rd-input-plain"
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  minLength={8}
                  disabled={loading}
                />
                <button
                  type="submit"
                  className="rd-btn"
                  style={{ marginTop: 16 }}
                  disabled={loading || !firstName.trim() || !email.trim() || password.length < 8}
                >
                  {loading && signupMode === 'email' ? 'Creating account…' : 'Create account & redeem'}
                </button>
              </form>

              {error && <div className="rd-msg rd-msg-err">{error}</div>}

              <p className="rd-help" style={{ marginTop: 20 }}>
                Already have an account? <Link href={`/login?next=${encodeURIComponent(`/redeem?code=${code.trim()}`)}`}>Sign in</Link> and we&apos;ll finish redeeming.
              </p>
            </>
          )}

          {screen === 'processing' && (
            <>
              <h1 className="rd-title">Activating your plan…</h1>
              <p className="rd-sub">Redeeming your code and setting up your account. This will just take a second.</p>
              {error && <div className="rd-msg rd-msg-err" style={{ marginTop: 20 }}>{error}</div>}
            </>
          )}

          {screen === 'success' && (
            <>
              <h1 className="rd-title">You&apos;re all set.</h1>
              <p className="rd-sub">Your CalConnect Lifetime plan is active. Head to your dashboard to connect your first Google Calendar.</p>
              <Link href="/dashboard" className="rd-btn" style={{ marginTop: 16, display: 'block', textAlign: 'center', textDecoration: 'none' }}>
                Go to dashboard →
              </Link>
            </>
          )}
        </div>
      </div>
    </>
  )
}

const CSS = `
.rd-wrap { min-height: 100vh; background: #f7f5ee; display: flex; align-items: center; justify-content: center; padding: 40px 24px; }
.rd-card { background: #ffffff; border-radius: 16px; padding: 40px; max-width: 480px; width: 100%; box-shadow: 0 8px 40px rgba(0,0,0,0.06); }
.rd-brand { font-family: 'Iowan Old Style', Georgia, serif; font-size: 22px; letter-spacing: -0.005em; margin-bottom: 32px; color: #14140f; text-align: center; }
.rd-brand em { font-style: italic; color: #de5b28; }
.rd-title { font-family: 'Iowan Old Style', Georgia, serif; font-size: 30px; letter-spacing: -0.02em; color: #14140f; margin: 0 0 8px; font-weight: 400; text-align: center; }
.rd-sub { font-size: 15px; color: #4e4d47; line-height: 1.5; margin: 0 0 24px; text-align: center; }
.rd-input { width: 100%; padding: 14px 16px; font-size: 16px; font-family: 'SF Mono', ui-monospace, Menlo, monospace; letter-spacing: 0.02em; border: 1px solid #d5d3ce; border-radius: 8px; box-sizing: border-box; }
.rd-input-plain { font-family: inherit; letter-spacing: normal; padding: 10px 12px; font-size: 15px; }
.rd-input:focus { outline: none; border-color: #de5b28; }
.rd-label { display: block; font-size: 13px; color: #4e4d47; font-weight: 500; margin-bottom: 6px; }
.rd-btn { display: block; width: 100%; padding: 14px 20px; margin-top: 12px; background: #de5b28; color: white; border: none; border-radius: 8px; font-size: 15px; font-weight: 500; cursor: pointer; text-align: center; text-decoration: none; box-sizing: border-box; }
.rd-btn:hover:not(:disabled) { background: #c14b1e; }
.rd-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.rd-btn-outline { background: white; color: #14140f; border: 1px solid #d5d3ce; margin-top: 0; }
.rd-btn-outline:hover:not(:disabled) { background: #f7f5ee; }
.rd-divider { display: flex; align-items: center; gap: 12px; margin: 20px 0; color: #8a887f; font-size: 13px; }
.rd-divider::before, .rd-divider::after { content: ''; flex: 1; height: 1px; background: #e0dfd8; }
.rd-msg { margin-top: 18px; padding: 12px 16px; border-radius: 8px; font-size: 14px; line-height: 1.45; }
.rd-msg-err { background: #fff0ed; color: #a11616; border: 1px solid #f0c9c0; }
.rd-msg-ok { background: #e8f5e9; color: #1e5f22; border: 1px solid #b8ddba; }
.rd-help { font-size: 13px; color: #8a887f; margin-top: 24px; line-height: 1.5; text-align: center; }
.rd-help a { color: #de5b28; text-decoration: underline; }
`
