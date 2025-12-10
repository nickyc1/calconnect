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
  is_active: boolean
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

        // Poll for new account
        const pollInterval = setInterval(async () => {
          await loadData()
        }, 3000)

        // Stop polling after 2 minutes
        setTimeout(() => {
          clearInterval(pollInterval)
          setActionLoading(false)
          setStatus('')
        }, 120000)
      }
    } catch (error: any) {
      setStatus(`Error: ${error.message}`)
      setActionLoading(false)
    }
  }

  const setSourceAccount = async (accountId: string) => {
    setActionLoading(true)
    setStatus('Setting source account...')

    try {
      const res = await fetch(`/api/accounts/${accountId}/set-source`, {
        method: 'POST'
      })
      const data = await res.json()

      if (data.success) {
        setStatus('Source account set!')
        await loadData()
      } else {
        setStatus(`Error: ${data.error}`)
      }
    } catch (error: any) {
      setStatus(`Error: ${error.message}`)
    }

    setActionLoading(false)
  }

  const activateMirroring = async () => {
    setActionLoading(true)
    setStatus('Activating mirroring...')

    try {
      const res = await fetch('/api/mirroring/activate', {
        method: 'POST'
      })
      const data = await res.json()

      if (data.success) {
        setStatus('Mirroring activated!')
        await loadData()
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

  const sourceAccount = accounts.find(a => a.is_source_account)
  const destinationAccounts = accounts.filter(a => !a.is_source_account)
  const hasActiveSources = sources.some(s => s.is_active)

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
                <div>
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
                {!account.is_source_account && !hasActiveSources && (
                  <button
                    onClick={() => setSourceAccount(account.account_id)}
                    disabled={actionLoading}
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#eee',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Set as Source
                  </button>
                )}
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
                Events from <strong>{sourceAccount?.account_display_name}</strong> are being
                mirrored to {destinationAccounts.length} destination calendar(s).
              </p>
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
              Deactivate Mirroring
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
                  : !sourceAccount
                    ? 'Select a source account to enable mirroring.'
                    : 'Ready to activate mirroring.'}
              </p>
            </div>
            {accounts.length >= 2 && sourceAccount && (
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
                Activate Mirroring
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
          <li>Select one account as the "source"</li>
          <li>Activate mirroring</li>
          <li>Events in source calendar automatically appear as "Busy" in all other calendars</li>
        </ol>
      </div>
    </div>
  )
}
