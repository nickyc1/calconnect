'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useSearchParams } from 'next/navigation'

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
    patch: { mirrorColorId?: string; mirrorLabel?: string }
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
            ? { ...a, mirror_color_id: data.mirrorColorId, mirror_label: data.mirrorLabel }
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
    if (!confirm(`Remove ${accountName}? This action cannot be undone.`)) {
      return
    }

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
                        <span className="cc-tooltip-bubble">Events here show as &quot;Busy&quot; on your other calendars.</span>
                      </span>
                    </span>
                  </label>
                  <button
                    onClick={() => removeAccount(account.account_id, account.google_email || account.account_display_name || account.account_id)}
                    disabled={actionLoading || hasActiveSources}
                    style={{
                      padding: '0.4rem 0.8rem',
                      background: hasActiveSources ? '#ccc' : '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '0.85rem',
                      cursor: (actionLoading || hasActiveSources) ? 'not-allowed' : 'pointer',
                      opacity: (actionLoading || hasActiveSources) ? 0.5 : 1
                    }}
                    title={hasActiveSources ? 'Disable mirroring first' : 'Remove account'}
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
                return (
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: '0.75rem',
                    paddingTop: '0.5rem',
                    borderTop: '1px dashed #e5e5e5',
                  }}>
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
                    <span style={{
                      fontSize: '0.75rem',
                      color: mirrorSaved === account.account_id ? '#0e6b2f' : '#999',
                      minWidth: 60,
                    }}>
                      {savingThis ? 'Saving…' : (mirrorSaved === account.account_id ? 'Saved' : '')}
                    </span>
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

      {/* How it works */}
      <div style={{
        background: 'white',
        padding: '1.5rem',
        borderRadius: '8px',
        fontSize: '0.9rem',
        color: '#666',
        border: '1px solid #e5e7eb'
      }}>
        <h4 style={{ marginTop: 0, color: '#333' }}>How it works</h4>
        <ol style={{ paddingLeft: '1.25rem' }}>
          <li>Connect 2 or more Google Calendar accounts</li>
          <li>Select which accounts are "source" calendars</li>
          <li>Enable mirroring</li>
          <li>Events in source calendars automatically appear as "Busy" in all other calendars</li>
          <li>Deletions and updates sync automatically</li>
        </ol>
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
                <div style={{ fontSize: '0.8rem', color: '#4a4a45' }}>10 calendars + AI summaries</div>
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
