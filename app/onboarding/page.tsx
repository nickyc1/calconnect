'use client'

import { Suspense, useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

/**
 * /onboarding
 *
 * Post-signup plan picker. After a user completes Google OAuth, they land
 * here to select Basic or Pro (which starts a 7-day trial with card required)
 * OR to redeem an AppSumo code. Existing users who already have a paid plan
 * are bounced straight to /dashboard so they never see this page twice.
 *
 * If Stripe checkout was cancelled (user hit back from Stripe), we detect
 * ?checkout=cancelled and show a friendly banner so they know they can pick
 * a different plan without being dumped on the free-plan dashboard.
 */

const CSS = `
.ob-wrap { min-height: 100vh; background: #f7f5ee; display: flex; align-items: center; justify-content: center; padding: 40px 24px; }
.ob-card { background: #ffffff; border-radius: 20px; padding: 48px; max-width: 720px; width: 100%; box-shadow: 0 12px 60px rgba(0,0,0,0.06); }
.ob-brand { font-family: 'Iowan Old Style', Georgia, serif; font-size: 22px; letter-spacing: -0.005em; margin-bottom: 40px; color: #14140f; }
.ob-brand em { font-style: italic; color: #de5b28; }
.ob-title { font-family: 'Iowan Old Style', Georgia, serif; font-size: 36px; line-height: 1.1; letter-spacing: -0.02em; color: #14140f; margin: 0 0 12px; font-weight: 400; }
.ob-title em { font-style: italic; color: #de5b28; }
.ob-sub { font-size: 16px; color: #4e4d47; line-height: 1.5; margin: 0 0 28px; max-width: 480px; }
.ob-toggle { display: inline-flex; padding: 4px; background: #efece2; border-radius: 999px; margin-bottom: 24px; font-family: inherit; }
.ob-toggle button { background: transparent; border: none; padding: 8px 18px; font-size: 14px; font-weight: 500; color: #4e4d47; cursor: pointer; border-radius: 999px; font-family: inherit; display: inline-flex; align-items: center; gap: 8px; transition: background 150ms, color 150ms; }
.ob-toggle button.active { background: #14140f; color: #f7f5ee; }
.ob-toggle-save { font-size: 11px; padding: 2px 7px; border-radius: 999px; background: rgba(30,95,34,0.15); color: #1e5f22; font-weight: 600; letter-spacing: 0.03em; }
.ob-toggle button.active .ob-toggle-save { background: rgba(247,245,238,0.2); color: #a7d3aa; }
.ob-cancel-banner { padding: 12px 16px; background: #fff8e1; border: 1px solid #f0d174; border-radius: 10px; margin-bottom: 20px; color: #5c4a10; font-size: 14px; line-height: 1.5; }
.ob-plans { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
.ob-plan { text-align: left; padding: 28px 24px; border: 1.5px solid #d5d3ce; border-radius: 14px; background: white; cursor: pointer; transition: all 150ms ease; font-family: inherit; }
.ob-plan:hover:not(:disabled) { border-color: #14140f; box-shadow: 0 8px 24px rgba(0,0,0,0.06); }
.ob-plan:disabled { opacity: 0.55; cursor: not-allowed; }
.ob-plan-featured { border: 2px solid #14140f; position: relative; }
.ob-plan-badge { position: absolute; top: -12px; left: 20px; background: #14140f; color: #f7f5ee; padding: 4px 12px; border-radius: 999px; font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
.ob-plan-name { font-family: inherit; font-size: 20px; font-weight: 600; color: #14140f; margin-bottom: 4px; }
.ob-plan-price { font-family: 'Iowan Old Style', Georgia, serif; font-size: 32px; color: #14140f; letter-spacing: -0.01em; margin-bottom: 4px; }
.ob-plan-price small { font-family: -apple-system, sans-serif; font-size: 15px; color: #4e4d47; font-weight: 400; }
.ob-plan-savings { font-size: 12px; color: #1e5f22; font-weight: 500; margin-bottom: 2px; }
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
  return (
    <Suspense fallback={null}>
      <OnboardingContent />
    </Suspense>
  )
}

function OnboardingContent() {
  const [checking, setChecking] = useState(true)
  const [userEmail, setUserEmail] = useState('')
  const [loadingIntent, setLoadingIntent] = useState<string>('')
  const [error, setError] = useState('')
  // Yearly by default — 17% discount, better LTV, industry norm.
  const [cadence, setCadence] = useState<'monthly' | 'yearly'>('yearly')
  const router = useRouter()
  const searchParams = useSearchParams()
  const wasCancelled = searchParams.get('checkout') === 'cancelled'

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

  const startTrial = async (
    intent: 'basic_monthly' | 'basic_yearly' | 'pro_monthly' | 'pro_yearly',
  ) => {
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

  // Price display per cadence. Yearly saves ~17% vs paying monthly.
  const basicPrice = cadence === 'yearly'
    ? { amount: '$40', unit: '/yr after trial', savings: 'Save $8 vs monthly', intent: 'basic_yearly' as const }
    : { amount: '$4',  unit: '/mo after trial', savings: '',                    intent: 'basic_monthly' as const }
  const proPrice = cadence === 'yearly'
    ? { amount: '$100', unit: '/yr after trial', savings: 'Save $20 vs monthly', intent: 'pro_yearly' as const }
    : { amount: '$10',  unit: '/mo after trial', savings: '',                     intent: 'pro_monthly' as const }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="ob-wrap">
        <div className="ob-card" style={{ position: 'relative' }}>
          <button className="ob-sign-out" onClick={signOut}>Sign out ({userEmail})</button>
          <div className="ob-brand">Cal<em>Connect</em></div>
          <h1 className="ob-title">Almost there — pick your <em>plan.</em></h1>
          <p className="ob-sub">Start a 7-day free trial. $0 due today, cancel any time. We&apos;ll charge your card on day 7 unless you cancel.</p>

          {wasCancelled && (
            <div className="ob-cancel-banner">
              No worries — pick a different plan below when you&apos;re ready. We didn&apos;t charge anything.
            </div>
          )}

          <div className="ob-toggle" role="tablist" aria-label="Billing cadence">
            <button
              type="button"
              role="tab"
              aria-selected={cadence === 'monthly'}
              className={cadence === 'monthly' ? 'active' : ''}
              onClick={() => setCadence('monthly')}
              disabled={!!loadingIntent}
            >
              Monthly
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={cadence === 'yearly'}
              className={cadence === 'yearly' ? 'active' : ''}
              onClick={() => setCadence('yearly')}
              disabled={!!loadingIntent}
            >
              Yearly <span className="ob-toggle-save">Save 17%</span>
            </button>
          </div>

          <div className="ob-plans">
            <button
              className="ob-plan"
              onClick={() => startTrial(basicPrice.intent)}
              disabled={!!loadingIntent}
            >
              <div className="ob-plan-name">Basic</div>
              <div className="ob-plan-price">{basicPrice.amount}<small>{basicPrice.unit}</small></div>
              {basicPrice.savings && <div className="ob-plan-savings">{basicPrice.savings}</div>}
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
              onClick={() => startTrial(proPrice.intent)}
              disabled={!!loadingIntent}
            >
              <div className="ob-plan-badge">Most popular</div>
              <div className="ob-plan-name">Pro</div>
              <div className="ob-plan-price">{proPrice.amount}<small>{proPrice.unit}</small></div>
              {proPrice.savings && <div className="ob-plan-savings">{proPrice.savings}</div>}
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
