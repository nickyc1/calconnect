'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'

interface Account {
  id: string
  account_id: string
  account_display_name: string
  is_active: boolean
  is_source_account: boolean
}

interface Source {
  id: string
  source_id: string
  source_type: string
  account_id: string
}

export default function DashboardPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [userId, setUserId] = useState<string | null>(null)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setUserId(user.id)

    // Load accounts
    const accountsRes = await fetch('/api/accounts')
    const accountsData = await accountsRes.json()
    setAccounts(accountsData.accounts || [])

    // Load sources
    const sourcesRes = await fetch('/api/sources')
    const sourcesData = await sourcesRes.json()
    setSources(sourcesData.sources || [])

    setLoading(false)
  }

  const connectAccount = async () => {
    setActionLoading(true)
    setStatus('Generating connect token...')

    try {
      const res = await fetch('/api/connect/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      })
      const data = await res.json()

      if (data.connectLinkUrl) {
        setStatus('Opening connection window...')
        window.open(`${data.connectLinkUrl}&app=google_calendar`, '_blank', 'width=500,height=600')

        // Poll for new account (Bug #3 fix: fetch fresh data and compare)
        let pollInterval: NodeJS.Timeout | null = null
        let pollTimeout: NodeJS.Timeout | null = null
        const initialCount = accounts.length

        const startPolling = () => {
          pollInterval = setInterval(async () => {
            // Fetch fresh accounts data directly
            const accountsRes = await fetch('/api/accounts')
            const accountsData = await accountsRes.json()
            const currentCount = accountsData.accounts?.length || 0

            // Stop polling if new account detected
            if (currentCount > initialCount) {
              if (pollInterval) clearInterval(pollInterval)
              if (pollTimeout) clearTimeout(pollTimeout)

              // Update UI with fresh data
              await loadData()
              setActionLoading(false)
              setStatus('Account connected successfully!')
              setTimeout(() => setStatus(''), 3000)
            }
          }, 3000)

          // Stop polling after 2 minutes
          pollTimeout = setTimeout(() => {
            if (pollInterval) clearInterval(pollInterval)
            setActionLoading(false)
            setStatus('')
          }, 120000)
        }

        startPolling()
      }
    } catch (error: any) {
      setStatus(`Error: ${error.message}`)
      setActionLoading(false)
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
    // Validate: need at least 2 accounts and at least 1 source
    // Note: All sources can also be destinations for other sources
    // (events from source A mirror to source B and vice versa)
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
      const res = await fetch('/api/mirroring/activate', {
        method: 'POST'
      })
      const data = await res.json()

      if (data.success) {
        setStatus(`Mirroring activated! ${data.sourcesDeployed || 0} sources deployed.`)
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
      const res = await fetch('/api/mirroring/deactivate', {
        method: 'POST'
      })
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
      const res = await fetch(`/api/accounts/${accountId}`, {
        method: 'DELETE'
      })
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

  const sourceAccounts = accounts.filter(a => a.is_source_account)
  const destinationAccounts = accounts.filter(a => !a.is_source_account)
  const hasActiveSources = sources.length > 0

  if (loading) {
    return <div>Loading...</div>
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <h2>Calendar Mirroring</h2>

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
        marginBottom: '1rem'
      }}>
        <h3 style={{ marginTop: 0 }}>Connected Accounts ({accounts.length}/3)</h3>

        {accounts.length === 0 ? (
          <p style={{ color: '#666' }}>No accounts connected yet.</p>
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
                  <strong>{account.account_display_name || account.account_id}</strong>
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
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    cursor: actionLoading ? 'not-allowed' : 'pointer',
                    opacity: actionLoading ? 0.5 : 1
                  }}>
                    <input
                      type="checkbox"
                      checked={account.is_source_account}
                      onChange={(e) => toggleSourceAccount(account.account_id, e.target.checked)}
                      disabled={actionLoading}
                      style={{
                        marginRight: '0.5rem',
                        width: '18px',
                        height: '18px',
                        cursor: actionLoading ? 'not-allowed' : 'pointer'
                      }}
                    />
                    <span style={{ fontSize: '0.9rem', color: '#666' }}>
                      Use as source calendar
                    </span>
                  </label>
                  <button
                    onClick={() => removeAccount(account.account_id, account.account_display_name || account.account_id)}
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

        {accounts.length < 3 && (
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
            Connect Google Calendar
          </button>
        )}
      </div>

      {/* Mirroring Status */}
      <div style={{
        background: 'white',
        padding: '1.5rem',
        borderRadius: '8px',
        marginBottom: '1rem'
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
                  <strong>Sources:</strong> {sourceAccounts.map(a => a.account_display_name || a.account_id).join(', ')}
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
              {sourceAccounts.length > 0 && accounts.length >= 2 && (
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem', color: '#666' }}>
                  {sourceAccounts.length} source(s) → {accounts.length - 1} destination(s) per source
                </p>
              )}
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

      {/* Info */}
      <div style={{
        background: 'white',
        padding: '1.5rem',
        borderRadius: '8px',
        fontSize: '0.9rem',
        color: '#666'
      }}>
        <h4 style={{ marginTop: 0, color: '#333' }}>How it works</h4>
        <ol style={{ paddingLeft: '1.25rem' }}>
          <li>Connect 2-3 Google Calendar accounts</li>
          <li>Select one or more accounts as "source" calendars using checkboxes</li>
          <li>Enable mirroring</li>
          <li>Events created in any source calendar automatically appear as "Busy" in all other calendars (including other sources)</li>
          <li>Events mirror to all accounts except the one where the event originated</li>
        </ol>
      </div>
    </div>
  )
}
