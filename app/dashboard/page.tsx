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
}

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
    if (success === 'account_connected') {
      setStatus('Account connected successfully!')
      setTimeout(() => setStatus(''), 3000)
    } else if (success === 'account_updated') {
      setStatus('Account tokens refreshed!')
      setTimeout(() => setStatus(''), 3000)
    } else if (error) {
      setStatus(`Error: ${error.replace(/_/g, ' ')}`)
    }
  }, [])

  const loadData = async () => {
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const accountsRes = await fetch('/api/accounts')
    const accountsData = await accountsRes.json()
    setAccounts(accountsData.accounts || [])

    const sourcesRes = await fetch('/api/sources')
    const sourcesData = await sourcesRes.json()
    setSources(sourcesData.sources || [])

    setLoading(false)
  }

  const connectAccount = () => {
    // Redirect to Google OAuth consent screen
    window.location.href = '/api/auth/google/connect'
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

  const signOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
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
        <h3 style={{ marginTop: 0 }}>Connected Accounts ({accounts.length}/5)</h3>

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
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
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
    </div>
  )
}
