'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import Link from 'next/link'

/**
 * /redeem
 *
 * The URL AppSumo buyers land on after purchasing a CalConnect code.
 * If they're not signed in, we send them to /login first and bring them back.
 * Once signed in, they paste their code and hit Redeem. Server-side does the
 * atomic claim; on success we bounce them to the dashboard with their
 * lifetime plan active.
 */

const CSS = `
.rd-wrap { min-height: 100vh; background: #f7f5ee; display: flex; align-items: center; justify-content: center; padding: 32px 24px; }
.rd-card { background: #ffffff; border-radius: 16px; padding: 40px; max-width: 520px; width: 100%; box-shadow: 0 8px 40px rgba(0,0,0,0.06); }
.rd-brand { font-family: 'Iowan Old Style', Georgia, serif; font-size: 22px; letter-spacing: -0.005em; margin-bottom: 32px; color: #14140f; }
.rd-brand em { font-style: italic; color: #de5b28; }
.rd-title { font-family: 'Iowan Old Style', Georgia, serif; font-size: 32px; letter-spacing: -0.02em; color: #14140f; margin: 0 0 8px; font-weight: 400; }
.rd-sub { font-size: 15px; color: #4e4d47; line-height: 1.5; margin: 0 0 24px; }
.rd-input { width: 100%; padding: 14px 16px; font-size: 16px; font-family: 'SF Mono', ui-monospace, Menlo, monospace; letter-spacing: 0.02em; border: 1px solid #d5d3ce; border-radius: 8px; box-sizing: border-box; }
.rd-input:focus { outline: none; border-color: #de5b28; }
.rd-btn { display: block; width: 100%; padding: 14px 20px; margin-top: 12px; background: #de5b28; color: white; border: none; border-radius: 8px; font-size: 15px; font-weight: 500; cursor: pointer; text-align: center; text-decoration: none; }
.rd-btn:hover:not(:disabled) { background: #c14b1e; }
.rd-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.rd-btn-secondary { background: transparent; color: #14140f; border: 1px solid #d5d3ce; }
.rd-msg { margin-top: 18px; padding: 12px 16px; border-radius: 8px; font-size: 14px; line-height: 1.45; }
.rd-msg-err { background: #fff0ed; color: #a11616; border: 1px solid #f0c9c0; }
.rd-msg-ok { background: #e8f5e9; color: #1e5f22; border: 1px solid #b8ddba; }
.rd-help { font-size: 13px; color: #8a887f; margin-top: 24px; line-height: 1.5; }
.rd-help a { color: #de5b28; text-decoration: underline; }
`

type Status = 'idle' | 'loading' | 'success' | 'error'

export default function RedeemPage() {
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')
  const [signedIn, setSignedIn] = useState<boolean | null>(null)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setSignedIn(!!data.user))
  }, [])

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim()) return
    setStatus('loading')
    setMessage('')
    try {
      const res = await fetch('/api/redeem-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      })
      const data = await res.json()
      if (res.ok && data?.success) {
        setStatus('success')
        setMessage(
          data.alreadyRedeemed
            ? 'This code is already active on your account. Your CalConnect Lifetime plan is ready to use.'
            : 'Code redeemed. Your CalConnect Lifetime plan is now active.',
        )
      } else {
        setStatus('error')
        setMessage(data?.error || 'Something went wrong. Please try again.')
      }
    } catch (err: any) {
      setStatus('error')
      setMessage('Network error. Please check your connection and try again.')
    }
  }

  if (signedIn === null) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="rd-wrap"><div className="rd-card"><p style={{ color: '#8a887f', textAlign: 'center' }}>Loading…</p></div></div>
      </>
    )
  }

  if (!signedIn) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="rd-wrap">
          <div className="rd-card">
            <div className="rd-brand">Cal<em>Connect</em></div>
            <h1 className="rd-title">Redeem your AppSumo code</h1>
            <p className="rd-sub">Sign in with Google first, then come back here to activate your Lifetime plan.</p>
            <Link href="/login?next=/redeem" className="rd-btn">Sign in with Google</Link>
            <p className="rd-help">Already have an account? <Link href="/login?next=/redeem">Sign in</Link> and you'll land back on this page.</p>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="rd-wrap">
        <div className="rd-card">
          <div className="rd-brand">Cal<em>Connect</em></div>
          <h1 className="rd-title">Redeem your AppSumo code</h1>
          <p className="rd-sub">Paste the code AppSumo emailed you. This activates your CalConnect Lifetime plan (2 connected Google Calendars, forever).</p>
          <p className="rd-help" style={{ marginTop: 0, marginBottom: 20 }}>
            Lifetime codes are for new accounts only. If you already have an active CalConnect subscription, cancel it first, then redeem here.
          </p>

          <form onSubmit={handleRedeem}>
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
              disabled={status === 'loading' || status === 'success'}
            />
            <button
              type="submit"
              className="rd-btn"
              disabled={status === 'loading' || status === 'success' || !code.trim()}
            >
              {status === 'loading' ? 'Redeeming…' : 'Redeem'}
            </button>
          </form>

          {message && (
            <div className={`rd-msg ${status === 'success' ? 'rd-msg-ok' : 'rd-msg-err'}`}>
              {message}
            </div>
          )}

          {status === 'success' && (
            <Link href="/dashboard" className="rd-btn" style={{ marginTop: 16 }}>Go to dashboard →</Link>
          )}

          <p className="rd-help">
            Trouble redeeming? Email <a href="mailto:n.christensen4@gmail.com">n.christensen4@gmail.com</a> with your AppSumo receipt and the first 8 characters of your code.
          </p>
        </div>
      </div>
    </>
  )
}
