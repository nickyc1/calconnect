'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useSearchParams } from 'next/navigation'

/**
 * Tiny CSS-drawn calendar icon used in the "How CalConnect works" 3-step
 * explainer. topColor is the colored strip along the top; a small orange
 * checkmark badge appears in the bottom-right when checked (used to
 * represent a Source calendar).
 */
function CalIcon({ topColor, checked = false }: { topColor: string; checked?: boolean }) {
  return (
    <span style={{
      position: 'relative',
      display: 'inline-block',
      width: 24, height: 26,
      border: '1.5px solid #14140f',
      borderRadius: 3,
      background: 'white',
    }}>
      <span style={{
        position: 'absolute',
        top: -3, left: 0, right: 0,
        height: 6,
        background: topColor,
        borderRadius: '3px 3px 0 0',
      }} />
      {checked && (
        <span style={{
          position: 'absolute',
          bottom: -2, right: -6,
          width: 14, height: 14,
          background: '#de5b28',
          borderRadius: '50%',
          color: 'white',
          fontSize: 9,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700,
        }}>✓</span>
      )}
    </span>
  )
}

/**
 * One row of the step-3 visual — a colored strip, a calendar label, and a
 * tag block (either the source event title or the mirrored "Busy" label).
 */
function MiniRow({
  strip, label, tag, tagBg, tagColor, tagWeight = 500, italic = false,
}: {
  strip: string; label: string; tag: string; tagBg: string; tagColor: string;
  tagWeight?: number; italic?: boolean;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      background: 'white', border: '1px solid #ede9dc', borderRadius: 4,
      padding: '2px 6px', fontSize: 9,
    }}>
      <span style={{ width: 3, height: 12, borderRadius: 2, background: strip }} />
      <span style={{ color: '#4a4a45' }}>{label}</span>
      <span style={{
        background: tagBg, color: tagColor,
        padding: '0 4px', borderRadius: 3,
        fontWeight: tagWeight,
        fontStyle: italic ? 'italic' : 'normal',
      }}>{tag}</span>
    </div>
  )
}

interface MirrorWindow {
  days: number[]
  start_min: number
  end_min: number
  tz?: string
}

interface Account {
  id: string
  account_id: string
  account_display_name: string
  google_email: string
  is_active: boolean
  is_source_account: boolean
  needs_reauth?: boolean
  mirror_color_id?: string
  mirror_label?: string
  mirror_window?: MirrorWindow | null
  mirror_existing_enabled?: boolean
  backfill_status?: 'idle' | 'running' | 'canceling' | 'complete' | 'failed' | 'canceled'
  backfill_progress?: number
  backfill_total?: number | null
}

// Google Calendar event colors — hex approximations so we can render a picker.
// Values are the colorId strings Google's API expects.
const GOOGLE_EVENT_COLORS: Array<{ id: string; hex: string; name: string }> = [
  { id: '1',  hex: '#a4bdfc', name: 'Lavender' },
  { id: '2',  hex: '#7ae7bf', name: 'Sage' },
  { id: '3',  hex: '#dbadff', name: 'Grape' },
  { id: '4',  hex: '#ff887c', name: 'Flamingo' },
  { id: '5',  hex: '#fbd75b', name: 'Banana' },
  { id: '6',  hex: '#ffb878', name: 'Tangerine' },
  { id: '7',  hex: '#46d6db', name: 'Peacock' },
  { id: '8',  hex: '#c9c9c9', name: 'Graphite' },
  { id: '9',  hex: '#5484ed', name: 'Blueberry' },
  { id: '10', hex: '#51b749', name: 'Basil' },
  { id: '11', hex: '#dc2127', name: 'Tomato' },
]

interface Source {
  id: string
  source_id: string
  source_type: string
  account_id: string
  expiration?: string
}

export default function DashboardPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [billing, setBilling] = useState<{ plan: string; entitled_calendars: number; base_calendars: number; extra_calendars: number; subscription_status: string | null; current_period_end: string | null } | null>(null)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState('')
  // Local staging for per-source label edits so typing feels responsive; we
  // commit to the server on blur or explicit save.
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({})
  const [mirrorSaving, setMirrorSaving] = useState<string | null>(null)
  const [mirrorSaved, setMirrorSaved] = useState<string | null>(null)
  // Backfill modal state: which account, which stage, and the preview
  const [backfillModal, setBackfillModal] = useState<{
    accountId: string
    stage: 'preview' | 'confirm-cancel'
  } | null>(null)
  const [backfillPreview, setBackfillPreview] = useState<{
    estimateEvents: number
    isExact: boolean
    destCount: number
    minutesLow: number
    minutesHigh: number
  } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  // Local draft of the mirror window BEFORE the user has committed anything.
  // Clicking the checkbox pre-fills a draft (all 7 days, no times) but does
  // NOT save — the "Saved" toast only appears after the user changes a day or
  // sets a time. Prevents the "instant Saved" that Nick called out as jarring.
  const [windowDrafts, setWindowDrafts] = useState<Record<string, MirrorWindow>>({})
  const [cancelingBackfill, setCancelingBackfill] = useState(false)
  const searchParams = useSearchParams()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    loadData()

    // Check for URL params from OAuth callback
    const success = searchParams.get('success')
    const error = searchParams.get('error')
    const upgrade = searchParams.get('upgrade')
    const checkout = searchParams.get('checkout')
    if (success === 'account_connected') {
      setStatus('Account connected successfully!')
      setTimeout(() => setStatus(''), 3000)
    } else if (success === 'account_updated') {
      setStatus('Account tokens refreshed!')
      setTimeout(() => setStatus(''), 3000)
    } else if (error) {
      setStatus(`Error: ${error.replace(/_/g, ' ')}`)
    }
    if (upgrade === 'needed') {
      setShowUpgrade(true)
    }
    if (checkout === 'success') {
      // Stripe redirects back the moment the user hits Subscribe, but the
      // webhook that updates user_billing fires async (usually 1-5s later).
      // Poll billing until the plan flips off 'free' or we time out.
      setStatus('Payment complete — activating your plan...')
      pollBillingUntilActive(20).then(() => setTimeout(() => setStatus(''), 3000))
    } else if (checkout === 'cancelled') {
      setStatus('Checkout cancelled.')
      setTimeout(() => setStatus(''), 3000)
    }
  }, [])

  const pollBillingUntilActive = async (maxAttempts: number) => {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const res = await fetch('/api/billing', { cache: 'no-store' })
        if (res.ok) {
          const data = await res.json()
          setBilling(data)
          if (data?.plan && data.plan !== 'free') {
            setStatus('Plan active. Welcome aboard.')
            return
          }
        }
      } catch {}
      await new Promise(r => setTimeout(r, 1500))
    }
    setStatus('Payment received. Refresh in a moment if your plan still shows free.')
  }

  const loadData = async () => {
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserEmail(user.email || '')

    const accountsRes = await fetch('/api/accounts')
    const accountsData = await accountsRes.json()
    setAccounts(accountsData.accounts || [])

    const sourcesRes = await fetch('/api/sources')
    const sourcesData = await sourcesRes.json()
    setSources(sourcesData.sources || [])

    try {
      const billingRes = await fetch('/api/billing')
      if (billingRes.ok) setBilling(await billingRes.json())
    } catch {}

    setLoading(false)
  }

  const startCheckout = async (intent: string) => {
    setCheckoutLoading(intent)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent }),
      })
      const data = await res.json()
      if (data?.url) {
        window.location.href = data.url
      } else {
        setStatus(`Checkout error: ${data?.error || 'unknown'}`)
        setCheckoutLoading('')
      }
    } catch (err: any) {
      setStatus(`Checkout error: ${err?.message || 'unknown'}`)
      setCheckoutLoading('')
    }
  }

  const connectAccount = () => {
    // Client-side gate: if the user is already at their plan's calendar limit,
    // open the upgrade modal instead of sending them into an OAuth flow that
    // the server would just reject at the callback. Server enforcement still
    // runs on /api/auth/google/callback as the authoritative check — this
    // is purely a UX improvement so users don't waste a Google grant.
    if (billing) {
      const limit = billing.plan === 'free'
        ? Math.max(2, billing.entitled_calendars)
        : billing.entitled_calendars
      if (accounts.length >= limit) {
        setShowUpgrade(true)
        return
      }
    }
    window.location.href = '/api/auth/google/connect'
  }

  const saveMirrorConfig = async (
    accountId: string,
    patch: { mirrorColorId?: string; mirrorLabel?: string; mirrorWindow?: MirrorWindow | null }
  ) => {
    setMirrorSaving(accountId)
    try {
      const res = await fetch(`/api/accounts/${accountId}/mirror-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setStatus(data?.error || 'Could not save. Try again.')
        return
      }
      // Merge the server-returned values into local state so the UI reflects
      // the authoritative version (trimmed label, validated color).
      setAccounts((prev) =>
        prev.map((a) =>
          a.account_id === accountId
            ? {
                ...a,
                mirror_color_id: data.mirrorColorId ?? a.mirror_color_id,
                mirror_label: data.mirrorLabel ?? a.mirror_label,
                mirror_window: 'mirrorWindow' in data ? data.mirrorWindow : a.mirror_window,
              }
            : a
        )
      )
      setLabelDrafts((prev) => {
        const next = { ...prev }
        delete next[accountId]
        return next
      })
      setMirrorSaved(accountId)
      setTimeout(() => setMirrorSaved((cur) => (cur === accountId ? null : cur)), 1500)
    } finally {
      setMirrorSaving(null)
    }
  }

  // ==== Backfill (Pro): mirror existing events on the source calendar ====
  const openBackfillPreview = async (accountId: string, horizonYears: number = 1) => {
    setBackfillModal({ accountId, stage: 'preview' })
    setBackfillPreview(null)
    setPreviewLoading(true)
    try {
      const res = await fetch(`/api/mirroring/backfill/preview?accountId=${encodeURIComponent(accountId)}&horizonYears=${horizonYears}`)
      const data = await res.json()
      if (res.ok) setBackfillPreview(data)
    } catch (err) {
      console.warn('preview failed', err)
    } finally {
      setPreviewLoading(false)
    }
  }

  const closeBackfillModal = () => {
    setBackfillModal(null)
    setBackfillPreview(null)
  }

  const startBackfillConfirmed = async (accountId: string, horizonYears: number = 1) => {
    closeBackfillModal()
    // Optimistic UI
    setAccounts((prev) => prev.map((a) => a.account_id === accountId
      ? { ...a, mirror_existing_enabled: true, backfill_status: 'running', backfill_progress: 0, backfill_total: null }
      : a))
    try {
      const res = await fetch('/api/mirroring/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, action: 'enable', horizonYears }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        // Serialize error (409) → explain, don't just show raw message.
        if (res.status === 409 && data?.conflicts) {
          setStatus(`Another backfill is already running on ${data.conflicts.join(', ')}. Wait or cancel it before starting this one.`)
        } else if (res.status === 403) {
          setStatus('This feature is in beta and not yet enabled on your account. Contact support to opt in.')
        } else {
          setStatus(data?.error || 'Could not start backfill.')
        }
        setAccounts((prev) => prev.map((a) => a.account_id === accountId
          ? { ...a, mirror_existing_enabled: false, backfill_status: 'idle' }
          : a))
        return
      }
      setAccounts((prev) => prev.map((a) => a.account_id === accountId
        ? { ...a, backfill_status: data.status, backfill_progress: data.progress, backfill_total: data.total ?? null }
        : a))
    } catch (err: any) {
      setStatus(err?.message || 'Network error starting backfill.')
    }
  }

  const undoBackfill = async (accountId: string) => {
    setCancelingBackfill(true)
    setAccounts((prev) => prev.map((a) => a.account_id === accountId
      ? { ...a, backfill_status: 'canceling' }
      : a))
    try {
      const res = await fetch('/api/mirroring/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, action: 'undo' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setStatus(data?.error || 'Could not undo backfill.')
      }
    } finally {
      setCancelingBackfill(false)
    }
  }

  const cancelBackfillConfirmed = async (accountId: string) => {
    setCancelingBackfill(true)
    try {
      await toggleBackfill(accountId, false)
    } finally {
      setCancelingBackfill(false)
      closeBackfillModal()
    }
  }

  const toggleBackfill = async (accountId: string, enable: boolean) => {
    // Optimistic UI: reflect toggle instantly. Disable → 'canceling' (chunked
    // cleanup that the poll loop drives). Enable → 'running'.
    setAccounts((prev) => prev.map((a) => a.account_id === accountId
      ? { ...a, mirror_existing_enabled: enable, backfill_status: enable ? 'running' : 'canceling', backfill_progress: 0, backfill_total: null }
      : a))
    try {
      const res = await fetch('/api/mirroring/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, action: enable ? 'enable' : 'disable' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setStatus(data?.error || 'Could not update backfill.')
        // Revert optimistic
        setAccounts((prev) => prev.map((a) => a.account_id === accountId
          ? { ...a, mirror_existing_enabled: !enable, backfill_status: 'idle' }
          : a))
        return
      }
      setAccounts((prev) => prev.map((a) => a.account_id === accountId
        ? { ...a, backfill_status: data.status, backfill_progress: data.progress, backfill_total: data.total ?? null }
        : a))
    } catch (err: any) {
      setStatus(err?.message || 'Network error updating backfill.')
    }
  }

  // Poll active backfills every 2.5s. 'running' ticks forward; 'canceling'
  // re-calls disable which deletes another chunk of mirrors until done.
  useEffect(() => {
    const active = accounts.filter((a) => a.backfill_status === 'running' || a.backfill_status === 'canceling')
    if (active.length === 0) return
    const timer = setTimeout(async () => {
      for (const acct of active) {
        const action = acct.backfill_status === 'canceling' ? 'disable' : 'tick'
        try {
          const res = await fetch('/api/mirroring/backfill', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountId: acct.account_id, action }),
          })
          const data = await res.json().catch(() => ({}))
          if (res.ok) {
            setAccounts((prev) => prev.map((a) => a.account_id === acct.account_id
              ? {
                  ...a,
                  backfill_status: data.status,
                  backfill_progress: data.progress ?? a.backfill_progress,
                  backfill_total: data.total ?? a.backfill_total ?? null,
                }
              : a))
          }
        } catch (err) {
          console.warn('Backfill poll failed:', err)
        }
      }
    }, 2500)
    return () => clearTimeout(timer)
  }, [accounts])

  const toggleSourceAccount = async (accountId: string, isSource: boolean) => {
    setActionLoading(true)
    setStatus(isSource ? 'Adding source account...' : 'Removing source account...')

    try {
      const res = await fetch(`/api/accounts/${accountId}/toggle-source`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isSource })
      })
      const data = await res.json()

      if (data.success) {
        setStatus(isSource ? 'Source account added!' : 'Source account removed!')
        await loadData()
        setTimeout(() => setStatus(''), 2000)
      } else {
        setStatus(`Error: ${data.error}`)
      }
    } catch (error: any) {
      setStatus(`Error: ${error.message}`)
    }

    setActionLoading(false)
  }

  const activateMirroring = async () => {
    const sourceAccounts = accounts.filter(a => a.is_source_account)

    if (accounts.length < 2) {
      setStatus('Error: Need at least 2 accounts to enable mirroring')
      return
    }

    if (sourceAccounts.length === 0) {
      setStatus('Error: Select at least one source account')
      return
    }

    setActionLoading(true)
    setStatus('Activating mirroring...')

    try {
      const res = await fetch('/api/mirroring/activate', { method: 'POST' })
      const data = await res.json()

      if (data.success) {
        setStatus(`Mirroring activated! ${data.watchChannelsCreated || 0} watch channel(s) created.`)
        await loadData()
        setTimeout(() => setStatus(''), 3000)
      } else {
        setStatus(`Error: ${data.error}`)
      }
    } catch (error: any) {
      setStatus(`Error: ${error.message}`)
    }

    setActionLoading(false)
  }

  const deactivateMirroring = async () => {
    setActionLoading(true)
    setStatus('Deactivating mirroring...')

    try {
      const res = await fetch('/api/mirroring/deactivate', { method: 'POST' })
      const data = await res.json()

      if (data.success) {
        setStatus('Mirroring deactivated!')
        await loadData()
      } else {
        setStatus(`Error: ${data.error}`)
      }
    } catch (error: any) {
      setStatus(`Error: ${error.message}`)
    }

    setActionLoading(false)
  }

  const removeAccount = async (accountId: string, accountName: string) => {
    const account = accounts.find((a) => a.account_id === accountId)
    const wasSourceWithMirroring = account?.is_source_account && hasActiveSources
    const warning = wasSourceWithMirroring
      ? `Remove ${accountName}?\n\nMirroring on your other calendars keeps running. "Busy" blocks that were already written from this source will stay on your other calendars until you delete them manually in Google Calendar.\n\nThis cannot be undone.`
      : `Remove ${accountName}? This cannot be undone.`
    if (!confirm(warning)) return

    setActionLoading(true)
    setStatus('Removing account...')

    try {
      const res = await fetch(`/api/accounts/${accountId}`, { method: 'DELETE' })
      const data = await res.json()

      if (data.success) {
        setStatus('Account removed successfully!')
        await loadData()
        setTimeout(() => setStatus(''), 2000)
      } else {
        setStatus(`Error: ${data.error}`)
      }
    } catch (error: any) {
      setStatus(`Error: ${error.message}`)
    }

    setActionLoading(false)
  }

  const deleteAccount = async () => {
    if (deleteConfirmEmail.toLowerCase() !== userEmail.toLowerCase()) {
      setDeleteError('Email does not match your account email.')
      return
    }
    setDeleteLoading(true)
    setDeleteError('')
    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmEmail: deleteConfirmEmail }),
      })
      const data = await res.json()
      if (!res.ok) {
        setDeleteError(data?.error || 'Deletion failed. Contact support.')
        setDeleteLoading(false)
        return
      }
      // Sign out the (now-deleted) session and land on the marketing site.
      await supabase.auth.signOut()
      window.location.href = '/?deleted=1'
    } catch (err: any) {
      setDeleteError(err?.message || 'Deletion failed. Contact support.')
      setDeleteLoading(false)
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    // Land on the home page rather than /login. The /login route can trip an
    // edge-cache 405 the instant after auth state changes; the home page
    // renders cleanly for signed-out users.
    window.location.href = '/'
  }

  const [portalLoading, setPortalLoading] = useState(false)
  // "How CalConnect works" explainer is shown by default; user can dismiss.
  // Persisted via a cc_hide_explainer=1 cookie so it stays hidden across visits.
  const [hideExplainer, setHideExplainer] = useState(false)
  useEffect(() => {
    if (typeof document === 'undefined') return
    if (document.cookie.match(/(?:^|;\s*)cc_hide_explainer=1/)) {
      setHideExplainer(true)
    }
  }, [])
  const dismissExplainer = () => {
    setHideExplainer(true)
    document.cookie = `cc_hide_explainer=1; max-age=${60 * 60 * 24 * 365}; path=/; SameSite=Lax`
  }
  const restoreExplainer = () => {
    setHideExplainer(false)
    document.cookie = `cc_hide_explainer=0; max-age=0; path=/; SameSite=Lax`
  }
  const openBillingPortal = async () => {
    setPortalLoading(true)
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.url) {
        alert(data?.error || 'Could not open billing portal. Contact support.')
        setPortalLoading(false)
        return
      }
      window.location.href = data.url
    } catch (err: any) {
      alert(err?.message || 'Could not open billing portal.')
      setPortalLoading(false)
    }
  }

  const sourceAccounts = accounts.filter(a => a.is_source_account)
  const hasActiveSources = sources.length > 0

  if (loading) {
    return (
      <div style={{ maxWidth: '800px', margin: '4rem auto', textAlign: 'center', color: '#666' }}>
        Loading...
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem 1rem' }}>
      <style>{`
        .cc-tooltip { position: relative; display: inline-flex; align-items: center; }
        .cc-tooltip-trigger {
          display: inline-flex; align-items: center; justify-content: center;
          width: 14px; height: 14px; border-radius: 50%;
          background: #e0e0e0; color: #666; font-size: 10px; font-weight: 600;
          cursor: help;
        }
        .cc-tooltip-bubble {
          position: absolute; bottom: calc(100% + 6px); left: 50%;
          transform: translateX(-50%);
          background: #14140f; color: #f7f5ee;
          padding: 6px 10px; border-radius: 6px;
          font-size: 12px; line-height: 1.4; white-space: nowrap;
          opacity: 0; pointer-events: none;
          transition: opacity 80ms ease;
          font-weight: 400;
        }
        .cc-tooltip:hover .cc-tooltip-bubble { opacity: 1; }
      `}</style>

      {/* Reconnect banner — appears when any account's refresh token is dead */}
      {accounts.some(a => a.needs_reauth) && (
        <div style={{
          background: '#fff4e5',
          border: '1px solid #f0b072',
          borderRadius: '8px',
          padding: '0.9rem 1.1rem',
          marginBottom: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'wrap',
        }}>
          <div style={{ fontSize: '0.9rem', color: '#7a4f0f', lineHeight: 1.45 }}>
            <strong>Reconnect needed.</strong>{' '}
            {accounts.filter(a => a.needs_reauth).map(a => a.google_email || a.account_display_name).join(', ')}{' '}
            lost access. Mirroring for {accounts.filter(a => a.needs_reauth).length > 1 ? 'these accounts' : 'this account'} is paused
            until you reconnect.
          </div>
          <button
            onClick={connectAccount}
            style={{
              padding: '0.5rem 1rem',
              background: '#de5b28',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.85rem',
              cursor: 'pointer',
              fontWeight: 500,
              whiteSpace: 'nowrap',
            }}
          >Reconnect Google</button>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2 style={{ margin: 0 }}>CalConnect</h2>
        <button
          onClick={signOut}
          style={{
            padding: '0.5rem 1rem',
            background: 'transparent',
            border: '1px solid #ddd',
            borderRadius: '4px',
            cursor: 'pointer',
            color: '#666',
            fontSize: '0.85rem'
          }}
        >
          Sign out
        </button>
      </div>

      {/* Status Message */}
      {status && (
        <div style={{
          padding: '1rem',
          background: status.includes('Error') ? '#fee' : '#efe',
          color: status.includes('Error') ? '#c00' : '#060',
          borderRadius: '4px',
          marginBottom: '1rem'
        }}>
          {status}
        </div>
      )}

      {/* Connected Accounts */}
      <div style={{
        background: 'white',
        padding: '1.5rem',
        borderRadius: '8px',
        marginBottom: '1rem',
        border: '1px solid #e5e7eb'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
          <h3 style={{ margin: 0 }}>
            Connected Accounts ({accounts.length}
            {billing
              ? `/${Math.max(billing.entitled_calendars, billing.plan === 'free' ? 2 : billing.entitled_calendars)}`
              : ''})
          </h3>
          {billing && (
            <div style={{ fontSize: '0.85rem', color: '#4a4a45', display: 'flex', gap: '0.75rem', alignItems: 'baseline' }}>
              <span style={{
                background: billing.plan === 'free' ? '#f0eee5' : '#e8f5e9',
                color: billing.plan === 'free' ? '#4a4a45' : '#1e5f22',
                padding: '3px 10px', borderRadius: '999px',
                fontWeight: 500, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>{billing.plan}</span>
              {billing.subscription_status === 'trialing' && billing.current_period_end && (
                <span style={{
                  background: '#fff4e5', color: '#7a4f0f',
                  padding: '3px 10px', borderRadius: '999px',
                  fontWeight: 500, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                  Trial · {Math.max(0, Math.ceil((new Date(billing.current_period_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))}d left
                </span>
              )}
              <button
                onClick={() => setShowUpgrade(true)}
                style={{
                  background: 'transparent', border: 'none',
                  color: '#de5b28', cursor: 'pointer', fontSize: '0.85rem', padding: 0,
                  textDecoration: 'underline',
                }}
              >{billing.plan === 'free' ? 'Choose a plan' : 'Add calendars'}</button>
            </div>
          )}
        </div>

        {accounts.length === 0 ? (
          <p style={{ color: '#666' }}>No accounts connected yet. Connect your Google Calendar accounts to get started.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {accounts.map(account => (
              <li key={account.id} style={{
                padding: '0.75rem',
                background: '#f9f9f9',
                borderRadius: '4px',
                marginBottom: '0.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.65rem',
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <strong>{account.google_email || account.account_display_name || account.account_id}</strong>
                  {account.is_source_account && (
                    <span style={{
                      marginLeft: '0.5rem',
                      padding: '0.25rem 0.5rem',
                      background: '#4285f4',
                      color: 'white',
                      borderRadius: '4px',
                      fontSize: '0.75rem'
                    }}>
                      SOURCE
                    </span>
                  )}
                  {account.needs_reauth && (
                    <span style={{
                      marginLeft: '0.5rem',
                      padding: '0.25rem 0.5rem',
                      background: '#de5b28',
                      color: 'white',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                    }}>
                      RECONNECT
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      cursor: actionLoading ? 'not-allowed' : 'pointer',
                      opacity: actionLoading ? 0.5 : 1,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={account.is_source_account}
                      onChange={(e) => toggleSourceAccount(account.account_id, e.target.checked)}
                      disabled={actionLoading}
                      style={{ marginRight: '0.5rem', width: '18px', height: '18px', cursor: actionLoading ? 'not-allowed' : 'pointer' }}
                    />
                    <span style={{ fontSize: '0.9rem', color: '#666', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                      Source
                      <span className="cc-tooltip">
                        <span className="cc-tooltip-trigger">?</span>
                        <span className="cc-tooltip-bubble">Any event I add here will appear as Busy on my other calendars.</span>
                      </span>
                    </span>
                  </label>
                  <button
                    onClick={() => removeAccount(account.account_id, account.google_email || account.account_display_name || account.account_id)}
                    disabled={actionLoading}
                    style={{
                      padding: '0.4rem 0.8rem',
                      background: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '0.85rem',
                      cursor: actionLoading ? 'not-allowed' : 'pointer',
                      opacity: actionLoading ? 0.5 : 1,
                    }}
                    title="Remove this connected calendar"
                  >
                    Remove
                  </button>
                </div>
              </div>

              {account.is_source_account && (() => {
                const currentColor = account.mirror_color_id || '8'
                const currentLabel =
                  labelDrafts[account.account_id] !== undefined
                    ? labelDrafts[account.account_id]
                    : (account.mirror_label || 'Busy')
                const savingThis = mirrorSaving === account.account_id
                const isPro = billing?.plan === 'pro'
                const winActive = !!(account.mirror_window && account.mirror_window.days?.length)
                const win = account.mirror_window || { days: [1,2,3,4,5], start_min: 540, end_min: 1020 }
                const backfillStatus = account.backfill_status || 'idle'
                const backfillRunning = backfillStatus === 'running'
                const backfillOn = !!account.mirror_existing_enabled
                return (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.6rem',
                    paddingTop: '0.5rem',
                    borderTop: '1px dashed #e5e5e5',
                  }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '0.8rem', color: '#666' }}>
                      Mirrored blocks show as
                    </span>
                    <input
                      type="text"
                      value={currentLabel}
                      maxLength={60}
                      onChange={(e) =>
                        setLabelDrafts((prev) => ({ ...prev, [account.account_id]: e.target.value }))
                      }
                      onBlur={() => {
                        const draft = labelDrafts[account.account_id]
                        if (draft === undefined) return
                        const trimmed = draft.trim()
                        if (trimmed.length === 0 || trimmed === (account.mirror_label || 'Busy')) {
                          setLabelDrafts((prev) => {
                            const next = { ...prev }; delete next[account.account_id]; return next
                          })
                          return
                        }
                        saveMirrorConfig(account.account_id, { mirrorLabel: trimmed })
                      }}
                      disabled={savingThis}
                      placeholder="Busy"
                      style={{
                        padding: '0.35rem 0.55rem',
                        border: '1px solid #d5d3ce',
                        borderRadius: 4,
                        fontSize: '0.85rem',
                        width: '160px',
                      }}
                    />
                    <span style={{ fontSize: '0.8rem', color: '#666' }}>in this color</span>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {GOOGLE_EVENT_COLORS.map((c) => {
                        const selected = c.id === currentColor
                        return (
                          <button
                            key={c.id}
                            type="button"
                            title={c.name}
                            aria-label={c.name}
                            disabled={savingThis}
                            onClick={() =>
                              !selected && saveMirrorConfig(account.account_id, { mirrorColorId: c.id })
                            }
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: '50%',
                              background: c.hex,
                              border: selected ? '2px solid #14140f' : '1px solid rgba(0,0,0,0.15)',
                              cursor: savingThis ? 'wait' : (selected ? 'default' : 'pointer'),
                              padding: 0,
                              boxShadow: selected ? '0 0 0 2px rgba(20,20,15,0.15)' : 'none',
                            }}
                          />
                        )
                      })}
                    </div>
                    </div>

                    {/* Pro-only settings: mirror window + backfill */}
                    {isPro ? (
                      <>
                        {/* Row: Time/day window.
                            - Toggle ON = show draft (all 7 days, no times) locally; NOT saved yet
                            - Only saves once user actually picks a day off/on OR sets a time
                            - Days: green when selected, faint red when not
                            - Times: 15-minute dropdowns instead of manual entry
                            - Saved badge sits on the RIGHT so it doesn't push layout down */}
                        {(() => {
                          const draft = windowDrafts[account.account_id]
                          const isDrafting = !!draft && !account.mirror_window
                          const activeWin: MirrorWindow | null = draft || account.mirror_window || null
                          const showControls = !!activeWin
                          const localTz = typeof Intl !== 'undefined'
                            ? Intl.DateTimeFormat().resolvedOptions().timeZone
                            : 'local time'
                          const setDraftAndSave = (next: MirrorWindow) => {
                            setWindowDrafts((p) => { const c = {...p}; delete c[account.account_id]; return c })
                            saveMirrorConfig(account.account_id, { mirrorWindow: next })
                          }
                          const toggleDay = (i: number) => {
                            if (!activeWin) return
                            const on = activeWin.days.includes(i)
                            const newDays = on ? activeWin.days.filter(d => d !== i) : [...activeWin.days, i].sort()
                            if (newDays.length === 0) return
                            setDraftAndSave({ ...activeWin, days: newDays })
                          }
                          const setTime = (which: 'start_min' | 'end_min', minutes: number) => {
                            if (!activeWin) return
                            setDraftAndSave({ ...activeWin, [which]: minutes })
                          }
                          const timeOptions: {v: number; label: string}[] = []
                          for (let m = 0; m < 24 * 60; m += 15) {
                            const h = Math.floor(m / 60)
                            const mm = m % 60
                            const ampm = h >= 12 ? 'PM' : 'AM'
                            const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
                            timeOptions.push({ v: m, label: `${h12}:${String(mm).padStart(2,'0')} ${ampm}` })
                          }
                          return (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.8rem', flexWrap: 'wrap' }}>
                              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: '#4a4a45', whiteSpace: 'nowrap' }}>
                                <input
                                  type="checkbox"
                                  checked={showControls}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      // Draft only — don't save yet
                                      setWindowDrafts((p) => ({ ...p, [account.account_id]: { days: [0,1,2,3,4,5,6], start_min: 540, end_min: 1020 } }))
                                    } else {
                                      // Turn off: clear draft AND clear saved window
                                      setWindowDrafts((p) => { const c = {...p}; delete c[account.account_id]; return c })
                                      if (account.mirror_window) saveMirrorConfig(account.account_id, { mirrorWindow: null })
                                    }
                                  }}
                                />
                                <span>Mirror only certain days/times</span>
                              </label>
                              {showControls && activeWin && (
                                <>
                                  <div style={{ display: 'inline-flex', gap: 3 }}>
                                    {['S','M','T','W','T','F','S'].map((letter, i) => {
                                      const on = activeWin.days.includes(i)
                                      return (
                                        <button
                                          key={i}
                                          type="button"
                                          onClick={() => toggleDay(i)}
                                          style={{
                                            width: 26, height: 26, borderRadius: '50%',
                                            border: '1px solid ' + (on ? '#7ea87f' : '#e5c7c7'),
                                            background: on ? '#e8f3e6' : '#fceded',
                                            color: on ? '#1e5f22' : '#a86464',
                                            fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0,
                                            transition: 'all 0.15s',
                                          }}
                                          title={on ? 'Selected — click to remove' : 'Not selected — click to add'}
                                        >{letter}</button>
                                      )
                                    })}
                                  </div>
                                  <select
                                    value={activeWin.start_min}
                                    onChange={(e) => setTime('start_min', parseInt(e.target.value, 10))}
                                    style={{ padding: '3px 6px', border: '1px solid #d5d3ce', borderRadius: 4, fontSize: '0.8rem', background: 'white' }}
                                  >
                                    {timeOptions.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                                  </select>
                                  <span style={{ color: '#8a887f' }}>→</span>
                                  <select
                                    value={activeWin.end_min}
                                    onChange={(e) => setTime('end_min', parseInt(e.target.value, 10))}
                                    style={{ padding: '3px 6px', border: '1px solid #d5d3ce', borderRadius: 4, fontSize: '0.8rem', background: 'white' }}
                                  >
                                    {timeOptions.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                                  </select>
                                  <span style={{ color: '#8a887f', fontSize: '0.72rem' }}>({localTz})</span>
                                </>
                              )}
                              {/* Saved badge on the RIGHT so it doesn't shift the row */}
                              <span style={{
                                marginLeft: 'auto',
                                fontSize: '0.72rem',
                                color: mirrorSaved === account.account_id ? '#0e6b2f' : (isDrafting ? '#8a887f' : 'transparent'),
                                fontStyle: isDrafting && mirrorSaved !== account.account_id ? 'italic' : 'normal',
                              }}>
                                {isDrafting && mirrorSaved !== account.account_id ? 'Pick a day or time to save' : (mirrorSaved === account.account_id ? 'Saved' : ' ')}
                              </span>
                            </div>
                          )
                        })()}

                        {/* Row: Backfill existing events — button-driven with modal */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.8rem', flexWrap: 'wrap', color: '#4a4a45' }}>
                          {backfillStatus === 'idle' || backfillStatus === 'canceled' ? (
                            <button
                              type="button"
                              onClick={() => openBackfillPreview(account.account_id)}
                              style={{
                                background: 'white', border: '1px solid #d5d3ce', color: '#14140f',
                                padding: '5px 12px', borderRadius: 6, fontSize: '0.8rem',
                                cursor: 'pointer', fontFamily: 'inherit',
                              }}
                            >
                              Mirror existing events →
                            </button>
                          ) : backfillRunning ? (
                            <>
                              <span style={{ color: '#1e5f22', fontWeight: 500 }}>
                                {(account.backfill_progress || 0) === 0
                                  ? 'Starting…'
                                  : `Mirroring ${account.backfill_progress} events${account.backfill_total ? ` of ${account.backfill_total}` : ''}…`
                                }
                              </span>
                              <button
                                type="button"
                                onClick={() => setBackfillModal({ accountId: account.account_id, stage: 'confirm-cancel' })}
                                style={{
                                  background: 'transparent', border: '1px solid #d5d3ce', color: '#a11616',
                                  padding: '3px 10px', borderRadius: 6, fontSize: '0.75rem',
                                  cursor: 'pointer', fontFamily: 'inherit',
                                }}
                              >
                                Cancel
                              </button>
                            </>
                          ) : backfillStatus === 'complete' ? (
                            <>
                              <span style={{ color: '#1e5f22', fontWeight: 500 }}>
                                ✓ {account.backfill_progress || 0} existing events mirrored
                              </span>
                              <button
                                type="button"
                                onClick={() => setBackfillModal({ accountId: account.account_id, stage: 'confirm-cancel' })}
                                style={{ background: 'transparent', border: 'none', color: '#8a887f', fontSize: '0.75rem', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
                              >
                                Remove
                              </button>
                            </>
                          ) : backfillStatus === 'canceling' ? (
                            <span style={{ color: '#a11616', fontWeight: 500 }}>
                              Removing mirrored blocks…
                            </span>
                          ) : backfillStatus === 'failed' ? (
                            <>
                              <span style={{ color: '#a11616' }}>Backfill failed.</span>
                              <button
                                type="button"
                                onClick={() => openBackfillPreview(account.account_id)}
                                style={{ background: 'transparent', border: 'none', color: '#de5b28', fontSize: '0.75rem', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
                              >
                                Retry
                              </button>
                            </>
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: '0.75rem', color: '#8a887f' }}>
                        <a href="#" onClick={(e) => { e.preventDefault(); setShowUpgrade(true) }} style={{ color: '#de5b28', textDecoration: 'underline' }}>Upgrade to Pro</a>
                        {' '}for time/day windows and backfilling existing events.
                      </div>
                    )}
                  </div>
                )
              })()}
              </li>
            ))}
          </ul>
        )}

        {accounts.length < 5 && (
          <button
            onClick={connectAccount}
            disabled={actionLoading}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#4285f4',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: actionLoading ? 'not-allowed' : 'pointer',
              opacity: actionLoading ? 0.7 : 1
            }}
          >
            + Connect Google Calendar
          </button>
        )}
      </div>

      {/* Mirroring Status */}
      <div style={{
        background: 'white',
        padding: '1.5rem',
        borderRadius: '8px',
        marginBottom: '1rem',
        border: '1px solid #e5e7eb'
      }}>
        <h3 style={{ marginTop: 0 }}>Mirroring Status</h3>

        {hasActiveSources ? (
          <div>
            <div style={{
              padding: '1rem',
              background: '#efe',
              borderRadius: '4px',
              marginBottom: '1rem'
            }}>
              <strong style={{ color: '#060' }}>Active</strong>
              <p style={{ margin: '0.5rem 0 0 0', color: '#666' }}>
                {sourceAccounts.length} source(s) active. Each source mirrors to {accounts.length - 1} other account(s).
              </p>
              {sourceAccounts.length > 0 && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#666' }}>
                  <strong>Sources:</strong> {sourceAccounts.map(a => a.google_email || a.account_display_name || a.account_id).join(', ')}
                </div>
              )}
            </div>
            <button
              onClick={deactivateMirroring}
              disabled={actionLoading}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: actionLoading ? 'not-allowed' : 'pointer'
              }}
            >
              Disable Mirroring
            </button>
          </div>
        ) : (
          <div>
            <div style={{
              padding: '1rem',
              background: '#f5f5f5',
              borderRadius: '4px',
              marginBottom: '1rem'
            }}>
              <strong>Inactive</strong>
              <p style={{ margin: '0.5rem 0 0 0', color: '#666' }}>
                {accounts.length < 2
                  ? 'Connect at least 2 accounts to enable mirroring.'
                  : sourceAccounts.length === 0
                    ? 'Select at least one source account to enable mirroring.'
                    : 'Ready to enable mirroring.'}
              </p>
            </div>
            {accounts.length >= 2 && sourceAccounts.length > 0 && (
              <button
                onClick={activateMirroring}
                disabled={actionLoading}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: actionLoading ? 'not-allowed' : 'pointer'
                }}
              >
                Enable Mirroring
              </button>
            )}
          </div>
        )}
      </div>

      {/* Danger Zone */}
      <div style={{
        marginTop: '2rem',
        background: 'white',
        padding: '1.5rem',
        borderRadius: '8px',
        border: '1px solid #f3d0d0',
      }}>
        <h4 style={{ marginTop: 0, color: '#a11616', fontSize: '0.95rem' }}>Danger zone</h4>
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: '#666', lineHeight: 1.5 }}>
          Deleting your account stops all mirroring, revokes CalConnect&apos;s access to
          your Google calendars, and permanently removes your data. Mirrored &quot;Busy&quot;
          blocks already written to your other calendars will stay — bulk-delete them
          in Google Calendar if you want them gone.
        </p>
        <button
          onClick={() => { setShowDeleteModal(true); setDeleteError(''); setDeleteConfirmEmail(''); }}
          disabled={deleteLoading}
          style={{
            padding: '0.5rem 1rem',
            background: 'transparent',
            border: '1px solid #a11616',
            borderRadius: '4px',
            color: '#a11616',
            fontSize: '0.85rem',
            cursor: deleteLoading ? 'not-allowed' : 'pointer',
          }}
        >
          Delete my account
        </button>

        <div style={{ marginTop: '0.9rem', fontSize: '0.8rem', color: '#888' }}>
          Just want to stop billing?{' '}
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); if (!portalLoading) openBillingPortal(); }}
            style={{
              color: '#666',
              textDecoration: 'underline',
              cursor: portalLoading ? 'wait' : 'pointer',
            }}
          >
            {portalLoading ? 'Opening…' : 'Cancel my subscription'}
          </a>
          <span style={{ color: '#aaa' }}> — keeps your account, stops future charges.</span>
        </div>
      </div>

      {/* How CalConnect works — always-on 3-step explainer at the bottom.
          Users can hide it via a cookie; a small "Show" button appears if hidden. */}
      {!hideExplainer ? (
        <div style={{
          marginTop: '2rem',
          background: 'white',
          padding: '1.5rem',
          borderRadius: '8px',
          border: '1px solid #ede9dc',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a1a' }}>
              How <span style={{ color: '#de5b28', fontWeight: 700 }}>CalConnect</span> works
            </div>
            <button
              onClick={dismissExplainer}
              style={{ background: 'transparent', border: 'none', color: '#8a887f', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline', padding: '4px 8px' }}
            >
              Hide
            </button>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
          }}>
            {[
              {
                num: 1,
                title: 'Connect your Google Calendars',
                body: 'Sign in with each Google account. Two or more, however many you juggle.',
                visual: (
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                    <CalIcon topColor="#5484ed" />
                    <CalIcon topColor="#51b749" />
                    <CalIcon topColor="#de5b28" />
                  </div>
                ),
              },
              {
                num: 2,
                title: 'Pick your Source calendar(s)',
                body: 'A Source is a calendar whose events should show as Busy on your other calendars. Toggle at least one.',
                visual: (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
                    <CalIcon topColor="#de5b28" checked />
                    <span style={{ color: '#de5b28', fontSize: 14 }}>→</span>
                    <CalIcon topColor="#5484ed" />
                    <CalIcon topColor="#51b749" />
                  </div>
                ),
              },
              {
                num: 3,
                title: 'Events auto-mirror as "Busy"',
                body: 'Add an event to a Source calendar → it appears as Busy on the others in seconds. Deletions and updates sync too.',
                visual: (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
                    <MiniRow strip="#de5b28" label="Personal" tag="Doctor 2p" tagBg="#fee4d0" tagColor="#a04e00" tagWeight={600} />
                    <span style={{ color: '#de5b28', fontSize: 10, lineHeight: 1 }}>↓</span>
                    <MiniRow strip="#5484ed" label="Work" tag="Busy" tagBg="#efeadb" tagColor="#6a6659" italic />
                    <MiniRow strip="#51b749" label="Agency" tag="Busy" tagBg="#efeadb" tagColor="#6a6659" italic />
                  </div>
                ),
              },
            ].map((step) => (
              <div key={step.num} style={{
                background: '#faf9f4',
                border: '1px solid #ede9dc',
                borderRadius: '10px',
                padding: '14px 14px 12px',
                position: 'relative',
              }}>
                <div style={{
                  position: 'absolute', top: 12, right: 14,
                  width: 22, height: 22, background: '#14140f', color: '#f7f5ee',
                  borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 600, fontFamily: 'ui-monospace, monospace',
                }}>{step.num}</div>
                <div style={{ height: 68, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {step.visual}
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1a1a1a', marginBottom: 4, paddingRight: 26, lineHeight: 1.35 }}>
                  {step.title}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#4a4a45', lineHeight: 1.5 }}>
                  {step.body}
                </div>
              </div>
            ))}
          </div>

          <div style={{
            marginTop: '1rem',
            paddingTop: 12,
            borderTop: '1px dashed #ede9dc',
            fontSize: '0.8rem',
            color: '#4a4a45',
            textAlign: 'center',
          }}>
            <strong style={{ color: '#14140f' }}>Fully private.</strong> Event titles, attendees, and notes never leave the source calendar — only the time window and your custom label.
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <button
            onClick={restoreExplainer}
            style={{
              background: 'transparent',
              border: '1px dashed #d5d3ce',
              color: '#8a887f',
              padding: '8px 14px',
              borderRadius: 8,
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            Show &quot;How CalConnect works&quot;
          </button>
        </div>
      )}

      {backfillModal && (() => {
        const acct = accounts.find(a => a.account_id === backfillModal.accountId)
        if (!acct) return null
        const stage = backfillModal.stage
        return (
          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 55, padding: '1rem',
            }}
          >
            <div style={{ background: 'white', borderRadius: 14, padding: '2rem', maxWidth: 520, width: '100%', boxShadow: '0 30px 80px rgba(0,0,0,0.3)' }}>
              {stage === 'preview' ? (
                <>
                  <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.35rem', color: '#14140f' }}>Mirror existing events?</h3>
                  <p style={{ margin: '0 0 1.25rem', color: '#4a4a45', fontSize: '0.95rem', lineHeight: 1.5 }}>
                    CalConnect will look through events on <strong>{acct.google_email}</strong> over the next 1 year{acct.mirror_window ? ' (only during your selected days/times)' : ''} and create a &quot;Busy&quot; block on your other connected calendars for each one. Your source calendar is never modified.
                  </p>
                  <div style={{ background: '#faf9f4', border: '1px solid #ede9dc', borderRadius: 8, padding: '12px 14px', marginBottom: '1.25rem', fontSize: '0.9rem', color: '#4a4a45' }}>
                    {previewLoading ? (
                      <span style={{ color: '#8a887f' }}>Checking your calendar…</span>
                    ) : backfillPreview ? (
                      <>
                        <div><strong>{backfillPreview.isExact ? `${backfillPreview.estimateEvents.toLocaleString()}` : `About ${backfillPreview.estimateEvents.toLocaleString()}`}</strong> events found</div>
                        <div style={{ marginTop: 4 }}>Mirroring to <strong>{backfillPreview.destCount}</strong> other calendar{backfillPreview.destCount === 1 ? '' : 's'}</div>
                        <div style={{ marginTop: 4, color: '#8a887f' }}>Estimated time: ~{backfillPreview.minutesLow}{backfillPreview.minutesLow !== backfillPreview.minutesHigh ? `-${backfillPreview.minutesHigh}` : ''} min. You can cancel any time.</div>
                      </>
                    ) : (
                      <span style={{ color: '#a11616' }}>Could not preview. Try starting anyway or contact support.</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button
                      onClick={closeBackfillModal}
                      style={{ background: 'transparent', color: '#666', border: '1px solid #d5d3ce', borderRadius: 6, padding: '0.55rem 1rem', fontSize: '0.9rem', cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => startBackfillConfirmed(acct.account_id)}
                      disabled={previewLoading}
                      style={{ background: '#14140f', color: '#f7f5ee', border: 'none', borderRadius: 6, padding: '0.55rem 1.2rem', fontSize: '0.9rem', fontWeight: 500, cursor: previewLoading ? 'not-allowed' : 'pointer', opacity: previewLoading ? 0.6 : 1 }}
                    >
                      Yes, start mirroring
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem', color: '#14140f' }}>
                    {acct.backfill_status === 'complete' ? 'Remove backfilled blocks?' : 'Cancel and remove?'}
                  </h3>
                  <p style={{ margin: '0 0 1.25rem', color: '#4a4a45', fontSize: '0.95rem', lineHeight: 1.5 }}>
                    {acct.backfill_status === 'complete'
                      ? `This will delete the ${acct.backfill_progress || 0} "Busy" blocks CalConnect created from your existing events. New events (going forward) will continue to mirror as normal.`
                      : `This will stop the backfill and delete the ${acct.backfill_progress || 0} "Busy" blocks CalConnect has created so far. New events (going forward) will continue to mirror as normal. Your source calendar is untouched.`}
                  </p>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button
                      onClick={closeBackfillModal}
                      disabled={cancelingBackfill}
                      style={{ background: 'transparent', color: '#666', border: '1px solid #d5d3ce', borderRadius: 6, padding: '0.55rem 1rem', fontSize: '0.9rem', cursor: cancelingBackfill ? 'not-allowed' : 'pointer' }}
                    >
                      Keep it
                    </button>
                    <button
                      onClick={() => cancelBackfillConfirmed(acct.account_id)}
                      disabled={cancelingBackfill}
                      style={{ background: '#a11616', color: 'white', border: 'none', borderRadius: 6, padding: '0.55rem 1.2rem', fontSize: '0.9rem', fontWeight: 500, cursor: cancelingBackfill ? 'wait' : 'pointer', opacity: cancelingBackfill ? 0.6 : 1 }}
                    >
                      {cancelingBackfill ? 'Removing…' : 'Yes, remove blocks'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )
      })()}

      {showUpgrade && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 50, padding: '1rem',
          }}
        >
          <div style={{
            background: 'white', borderRadius: '14px', padding: '2rem',
            maxWidth: '560px', width: '100%',
            boxShadow: '0 30px 80px rgba(0,0,0,0.3)',
          }}>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.35rem', color: '#14140f' }}>
              {billing?.plan === 'free' ? 'Pick a plan to start mirroring' : 'Connect more calendars'}
            </h3>
            <p style={{ margin: '0 0 1.25rem', fontSize: '0.95rem', color: '#4a4a45', lineHeight: 1.5 }}>
              {billing?.plan === 'free'
                ? 'CalConnect needs at least two Google Calendars to mirror between. Pick a plan below to unlock connecting and mirroring.'
                : `You're at your plan's calendar limit. Upgrade your plan or add extra calendars at $4/month each.`}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
              <button
                onClick={() => startCheckout('basic_monthly')}
                disabled={!!checkoutLoading}
                style={{
                  padding: '1rem', border: '1.5px solid #14140f', borderRadius: '10px',
                  background: 'white', cursor: 'pointer', textAlign: 'left',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#14140f' }}>Basic</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 500, color: '#14140f', marginTop: '0.25rem' }}>$4/mo</div>
                <div style={{ fontSize: '0.8rem', color: '#4a4a45' }}>3 calendars</div>
                {billing?.plan === 'free' && (
                  <div style={{ fontSize: '0.75rem', color: '#1e5f22', marginTop: '0.4rem', fontWeight: 500 }}>7 days free · cancel any time</div>
                )}
              </button>

              <button
                onClick={() => startCheckout('pro_monthly')}
                disabled={!!checkoutLoading}
                style={{
                  padding: '1rem', border: '1.5px solid #14140f', borderRadius: '10px',
                  background: 'white', cursor: 'pointer', textAlign: 'left',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#14140f' }}>Pro</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 500, color: '#14140f', marginTop: '0.25rem' }}>$10/mo</div>
                <div style={{ fontSize: '0.8rem', color: '#4a4a45' }}>10 calendars + custom colors</div>
                {billing?.plan === 'free' && (
                  <div style={{ fontSize: '0.75rem', color: '#1e5f22', marginTop: '0.4rem', fontWeight: 500 }}>7 days free · cancel any time</div>
                )}
              </button>
            </div>

            {billing && billing.plan !== 'free' && (
              <button
                onClick={() => startCheckout('extra_calendar')}
                disabled={!!checkoutLoading}
                style={{
                  width: '100%', padding: '0.75rem 1rem',
                  border: '1px solid #e0dfd8', borderRadius: '8px',
                  background: '#f7f5ee', cursor: 'pointer',
                  fontSize: '0.9rem', color: '#14140f', marginBottom: '1rem',
                }}
              >
                Already on a plan? Add one more calendar for $4/mo →
              </button>
            )}

            {checkoutLoading && (
              <div style={{ fontSize: '0.85rem', color: '#4a4a45', textAlign: 'center', marginBottom: '0.5rem' }}>
                Redirecting to Stripe checkout…
              </div>
            )}

            <button
              onClick={() => setShowUpgrade(false)}
              style={{
                width: '100%', padding: '0.6rem', background: 'transparent',
                border: 'none', color: '#8a887f', cursor: 'pointer', fontSize: '0.85rem',
              }}
            >Not now</button>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 50, padding: '1rem',
          }}
        >
          <div style={{
            background: 'white', borderRadius: '10px', padding: '1.75rem',
            maxWidth: '440px', width: '100%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          }}>
            <h3 style={{ margin: '0 0 0.5rem', color: '#14140f', fontSize: '1.1rem' }}>
              Delete your CalConnect account?
            </h3>
            <p style={{ margin: '0 0 1rem', fontSize: '0.9rem', color: '#4a4a45', lineHeight: 1.5 }}>
              This will stop all mirroring, revoke Google access, and delete every row
              tied to your account. This can&apos;t be undone.
            </p>
            <p style={{ margin: '0 0 0.4rem', fontSize: '0.85rem', color: '#4a4a45' }}>
              Type <strong>{userEmail}</strong> to confirm:
            </p>
            <input
              type="email"
              value={deleteConfirmEmail}
              onChange={(e) => { setDeleteConfirmEmail(e.target.value); setDeleteError(''); }}
              placeholder={userEmail}
              autoComplete="off"
              spellCheck={false}
              style={{
                width: '100%', padding: '0.6rem 0.75rem',
                border: '1px solid #d5d3ce', borderRadius: '6px',
                fontSize: '0.95rem', boxSizing: 'border-box',
              }}
            />
            {deleteError && (
              <div style={{
                marginTop: '0.5rem', padding: '0.5rem 0.75rem',
                background: '#fee', color: '#a11616',
                borderRadius: '4px', fontSize: '0.85rem',
              }}>{deleteError}</div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deleteLoading}
                style={{
                  padding: '0.55rem 1rem', background: 'transparent',
                  border: '1px solid #d5d3ce', borderRadius: '6px',
                  color: '#4a4a45', cursor: deleteLoading ? 'not-allowed' : 'pointer',
                  fontSize: '0.9rem',
                }}
              >Cancel</button>
              <button
                onClick={deleteAccount}
                disabled={deleteLoading || deleteConfirmEmail.toLowerCase() !== userEmail.toLowerCase()}
                style={{
                  padding: '0.55rem 1rem', background: '#a11616',
                  border: '1px solid #a11616', borderRadius: '6px',
                  color: 'white', cursor: deleteLoading ? 'not-allowed' : 'pointer',
                  fontSize: '0.9rem',
                  opacity: (deleteLoading || deleteConfirmEmail.toLowerCase() !== userEmail.toLowerCase()) ? 0.5 : 1,
                }}
              >
                {deleteLoading ? 'Deleting…' : 'Delete account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
