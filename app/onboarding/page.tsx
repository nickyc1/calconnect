'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

/**
 * /onboarding
 *
 * Post-signup plan picker. After a user completes Google OAuth, they land
 * here to select Basic or Pro (which starts a 7-day trial with card required)
 * OR to redeem an AppSumo code. Existing users who already have a paid plan
 * are bounced straight to /dashboard so they never see this page twice.
 */

const CSS = `
.ob-wrap { min-height: 100vh; background: #f7f5ee; display: flex; align-items: center; justify-content: center; padding: 40px 24px; }
.ob-card { background: #ffffff; border-radius: 20px; padding: 48px; max-width: 720px; width: 100%; box-shadow: 0 12px 60px rgba(0,0,0,0.06); }
.ob-brand { font-family: 'Iowan Old Style', Georgia, serif; font-size: 22px; letter-spacing: -0.005em; margin-bottom: 40px; color: #14140f; }
.ob-brand em { font-style: italic; color: #de5b28; }
.ob-title { font-family: 'Iowan Old Style', Georgia, serif; font-size: 36px; line-height: 1.1; letter-spacing: -0.02em; color: #14140f; margin: 0 0 12px; font-weight: 400; }
.ob-title em { font-style: italic; color: #de5b28; }
.ob-sub { font-size: 16px; color: #4e4d47; line-height: 1.5; margin: 0 0 36px; max-width: 480px; }
.ob-plans { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
.ob-plan { text-align: left; padding: 28px 24px; border: 1.5px solid #d5d3ce; border-radius: 14px; background: white; cursor: pointer; transition: all 150ms ease; font-family: inherit; }
.ob-plan:hover:not(:disabled) { border-color: #14140f; box-shadow: 0 8px 24px rgba(0,0,0,0.06); }
.ob-plan:disabled { opacity: 0.55; cursor: not-allowed; }
.ob-plan-featured { border: 2px solid #14140f; position: relative; }
.ob-plan-badge { position: absolute; top: -12px; left: 20px; background: #14140f; color: #f7f5ee; padding: 4px 12px; border-radius: 999px; font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
.ob-plan-name { font-family: inherit; font-size: 20px; font-weight: 600; color: #14140f; margin-bottom: 4px; }
.ob-plan-price { font-family: 'Iowan Old Style', Georgia, serif; font-size: 32px; color: #14140f; letter-spacing: -0.01em; margin-bottom: 4px; }
.ob-plan-price small { font-family: -apple-system, sans-serif; font-size: 15px; color: #4e4d47; font-weight: 400; }
.ob-plan-what { font-size: 14px; color: #4e4d47; margin-bottom: 16px; }
.ob-plan-trial { font-size: 13px; color: #1e5f22; font-weight: 500; margin-top: 12px; }
.ob-list { list-style: none; padding: 0; margin: 12px 0 0; }
.ob-list li { padding: 4px 0; font-size: 13px; color: #4e4d47; display: flex; align-items: flex-start; gap: 8px; }
.ob-list li::before { content: ''; display: inline-block; width: 4px; height: 7px; border-right: 1.5px solid #de5b28; border-bottom: 1.5px solid #de5b28; transform: rotate(45deg); margin-top: 5px; flex-shrink: 0; }
.ob-err { margin: 12px 0; padding: 10px 14px; background: #fff0ed; color: #a11616; border-radius: 8px; font-size: 14px; }
.ob-loading { margin: 12px 0; font-size: 14px; color: #4e4d47; text-align: center; }
.ob-alt { margin-top: 32px; padding-top: 24px; border-top: 0.5px solid #e0dfd8; font-size: 14px; color: #4e4d47; }
.ob-alt a { color: #de5b28; text-decoration: underline; }
.ob-sign-out { position: absolute; top: 28px; right: 28px; background: transparent; border: none; color: #8a887f; font-size: 13px; cursor: pointer; padding: 4px 8px; }
.ob-sign-out:hover { color: #14140f; }
@media (max-width: 560px) {
  .ob-plans { grid-template-columns: 1fr; }
  .ob-card { padding: 32px 24px; }
}
`

export default function OnboardingPage() {
  const [checking, setChecking] = useState(true)
  const [userEmail, setUserEmail] = useState('')
  const [loadingIntent, setLoadingIntent] = useState<string>('')
  const [error, setError] = useState('')
  const router = useRouter()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login?next=/onboarding')
        return
      }
      setUserEmail(user.email || '')
      // If user already has a paid plan, skip onboarding entirely
      try {
        const res = await fetch('/api/billing', { cache: 'no-store' })
        if (res.ok) {
          const data = await res.json()
          if (data?.plan && data.plan !== 'free') {
            router.replace('/dashboard')
            return
          }
        }
      } catch {}
      setChecking(false)
    })()
  }, [])

  const startTrial = async (intent: 'basic_monthly' | 'pro_monthly') => {
    setLoadingIntent(intent)
    setError('')
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent }),
      })
      const data = await res.json()
      if (res.ok && data?.url) {
        window.location.href = data.url
      } else {
        setError(data?.error || 'Could not start checkout. Please try again.')
        setLoadingIntent('')
      }
    } catch (err: any) {
      setError(err?.message || 'Network error. Please try again.')
      setLoadingIntent('')
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    router.replace('/')
  }

  if (checking) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="ob-wrap">
          <div className="ob-card"><p style={{ color: '#8a887f', textAlign: 'center' }}>Loading…</p></div>
        </div>
      </>
    )
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="ob-wrap">
        <div className="ob-card" style={{ position: 'relative' }}>
          <button className="ob-sign-out" onClick={signOut}>Sign out ({userEmail})</button>
          <div className="ob-brand">Cal<em>Connect</em></div>
          <h1 className="ob-title">Almost there — pick your <em>plan.</em></h1>
          <p className="ob-sub">Start a 7-day free trial. $0 due today, cancel any time. We&apos;ll charge your card on day 7 unless you cancel.</p>

          <div className="ob-plans">
            <button
              className="ob-plan"
              onClick={() => startTrial('basic_monthly')}
              disabled={!!loadingIntent}
            >
              <div className="ob-plan-name">Basic</div>
              <div className="ob-plan-price">$4<small>/mo after trial</small></div>
              <div className="ob-plan-what">3 connected Google Calendars</div>
              <ul className="ob-list">
                <li>Real-time push sync</li>
                <li>Recurring &amp; bidirectional mirroring</li>
                <li>Add calendars any time · $4/mo each</li>
              </ul>
              <div className="ob-plan-trial">7 days free · cancel any time</div>
            </button>

            <button
              className="ob-plan ob-plan-featured"
              onClick={() => startTrial('pro_monthly')}
              disabled={!!loadingIntent}
            >
              <div className="ob-plan-badge">Most popular</div>
              <div className="ob-plan-name">Pro</div>
              <div className="ob-plan-price">$10<small>/mo after trial</small></div>
              <div className="ob-plan-what">10 connected Google Calendars</div>
              <ul className="ob-list">
                <li>Everything in Basic</li>
                <li>Custom color and label per source calendar</li>
                <li>Priority email support</li>
              </ul>
              <div className="ob-plan-trial">7 days free · cancel any time</div>
            </button>
          </div>

          {error && <div className="ob-err">{error}</div>}
          {loadingIntent && <div className="ob-loading">Redirecting to secure checkout…</div>}

          <div className="ob-alt">
            Have an AppSumo code? <Link href="/redeem">Redeem it here →</Link>
          </div>
        </div>
      </div>
    </>
  )
}
