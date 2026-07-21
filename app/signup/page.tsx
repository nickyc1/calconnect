'use client'

import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Suspense, useState } from 'react'

/**
 * /signup
 *
 * New-account creation. Offers two paths:
 *   1. Continue with Google — same Supabase OAuth flow used by /login. Fastest
 *      onboarding because they'll need Google auth eventually to connect calendars.
 *   2. Email + password — traditional signup. User can create their account
 *      first and hook up Google Calendar later from the dashboard.
 *
 * After successful signup, the user lands on /onboarding to pick a plan.
 */

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupContent />
    </Suspense>
  )
}

function SignupContent() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  const [mode, setMode] = useState<'email' | 'google'>('google')
  const [firstName, setFirstName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [awaitingConfirm, setAwaitingConfirm] = useState(false)

  const startGoogleSignup = async () => {
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/onboarding')}`,
      },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    }
  }

  const submitEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!firstName.trim() || !email.trim() || password.length < 8) return
    setLoading(true)
    setError(null)

    const { data, error: signupError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: firstName.trim() },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
      },
    })

    if (signupError) {
      setError(signupError.message)
      setLoading(false)
      return
    }

    // If Supabase has email confirmation enabled, session will be null and
    // the user has to click the link in their inbox before proceeding.
    if (!data?.session) {
      setAwaitingConfirm(true)
      setLoading(false)
      return
    }

    // Auto-confirm path: session is live, go straight to onboarding.
    router.push('/onboarding')
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="su-wrap">
        <div className="su-card">
          <div className="su-brand">Cal<em>Connect</em></div>
          <h1 className="su-title">Create your account</h1>
          <p className="su-sub">Start your 7-day free trial. $0 due today, cancel any time.</p>

          {awaitingConfirm ? (
            <div className="su-ok">
              Check your email to confirm your account. Then head back here and sign in to pick your plan.
            </div>
          ) : (
            <>
              <div className="su-warn">
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Heads up: Google will show a warning</div>
                Google is finalizing our verification (4-6 weeks). If you continue with Google, click{' '}
                <strong>Advanced → Go to CalConnect (unsafe)</strong> to continue.
              </div>

              <button
                type="button"
                className="su-btn su-btn-google"
                onClick={startGoogleSignup}
                disabled={loading}
              >
                {loading && mode === 'google' ? 'Redirecting…' : 'Continue with Google'}
              </button>

              <div className="su-divider"><span>or</span></div>

              <form onSubmit={submitEmailSignup}>
                <label className="su-label">First name</label>
                <input
                  type="text"
                  className="su-input"
                  value={firstName}
                  onChange={(e) => { setFirstName(e.target.value); setMode('email') }}
                  autoComplete="given-name"
                  placeholder="Nick"
                  disabled={loading}
                />

                <label className="su-label" style={{ marginTop: 14 }}>Email</label>
                <input
                  type="email"
                  className="su-input"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setMode('email') }}
                  autoComplete="email"
                  placeholder="you@example.com"
                  disabled={loading}
                />

                <label className="su-label" style={{ marginTop: 14 }}>Password</label>
                <input
                  type="password"
                  className="su-input"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setMode('email') }}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  minLength={8}
                  disabled={loading}
                />

                {error && <div className="su-err">{error}</div>}

                <button
                  type="submit"
                  className="su-btn su-btn-primary"
                  disabled={loading || !firstName.trim() || !email.trim() || password.length < 8}
                >
                  {loading && mode === 'email' ? 'Creating account…' : 'Create account'}
                </button>
              </form>
            </>
          )}

          <p className="su-foot">
            Already have an account? <Link href="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </>
  )
}

const CSS = `
.su-wrap { min-height: 100vh; background: #f7f5ee; display: flex; align-items: center; justify-content: center; padding: 40px 24px; }
.su-card { background: #ffffff; border-radius: 18px; padding: 40px 36px; max-width: 460px; width: 100%; box-shadow: 0 10px 40px rgba(0,0,0,0.06); }
.su-brand { font-family: 'Iowan Old Style', Georgia, serif; font-size: 22px; letter-spacing: -0.005em; margin-bottom: 32px; color: #14140f; text-align: center; }
.su-brand em { font-style: italic; color: #de5b28; }
.su-title { font-family: 'Iowan Old Style', Georgia, serif; font-size: 30px; letter-spacing: -0.02em; color: #14140f; margin: 0 0 8px; text-align: center; font-weight: 400; }
.su-sub { font-size: 15px; color: #4e4d47; margin: 0 0 24px; text-align: center; line-height: 1.5; }
.su-warn { background: #fff8e1; border: 1px solid #f0d174; border-radius: 8px; padding: 12px 14px; margin-bottom: 20px; font-size: 13px; line-height: 1.5; color: #5c4a10; }
.su-btn { width: 100%; padding: 12px 16px; border-radius: 8px; font-size: 15px; font-weight: 500; cursor: pointer; border: none; text-align: center; box-sizing: border-box; }
.su-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.su-btn-google { background: white; color: #14140f; border: 1px solid #d5d3ce; }
.su-btn-google:hover:not(:disabled) { background: #f7f5ee; }
.su-btn-primary { background: #de5b28; color: white; margin-top: 16px; }
.su-btn-primary:hover:not(:disabled) { background: #c14b1e; }
.su-divider { display: flex; align-items: center; gap: 12px; margin: 20px 0; color: #8a887f; font-size: 13px; }
.su-divider::before, .su-divider::after { content: ''; flex: 1; height: 1px; background: #e0dfd8; }
.su-label { display: block; font-size: 13px; color: #4e4d47; margin-bottom: 6px; font-weight: 500; }
.su-input { width: 100%; padding: 10px 12px; border: 1px solid #d5d3ce; border-radius: 8px; font-size: 15px; box-sizing: border-box; font-family: inherit; }
.su-input:focus { outline: none; border-color: #de5b28; }
.su-err { margin-top: 12px; padding: 10px 12px; background: #fff0ed; color: #a11616; border-radius: 6px; font-size: 13px; }
.su-ok { padding: 14px 16px; background: #e8f5e9; color: #1e5f22; border-radius: 8px; font-size: 14px; line-height: 1.5; margin-bottom: 16px; }
.su-foot { margin-top: 28px; text-align: center; font-size: 14px; color: #4e4d47; }
.su-foot a { color: #de5b28; text-decoration: underline; }
`
