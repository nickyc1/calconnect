# CalConnect - MVP Implementation Plan

**Last Updated:** December 9, 2025
**Estimated Time:** 7 hours
**Target:** Multi-tenant MVP with Auth, Dashboard, and Mirroring Controls

---

## Prerequisites

Before starting, ensure you have:
- [ ] Access to Supabase project dashboard
- [ ] Access to Vercel deployment dashboard
- [ ] ngrok installed for local webhook testing
- [ ] Working PoC code in `calconnect_backend/`

---

## Phase 1: Database Migration (30 minutes)

### Step 1.1: Create Migration File

Create file: `calconnect_backend/supabase/migrations/004_mvp_enhancements.sql`

```sql
-- Migration 004: MVP Enhancements
-- Adds is_source_account flag for tracking which account is the mirroring source

-- =============================================================================
-- STEP 1: Add is_source_account column
-- =============================================================================

ALTER TABLE user_accounts
ADD COLUMN IF NOT EXISTS is_source_account BOOLEAN DEFAULT false;

-- =============================================================================
-- STEP 2: Create unique partial index (only one source per user)
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_accounts_source_unique
ON user_accounts(user_id)
WHERE is_source_account = true;

-- =============================================================================
-- STEP 3: Add user_id to webhook_events for debugging
-- =============================================================================

ALTER TABLE webhook_events
ADD COLUMN IF NOT EXISTS user_id TEXT;

-- =============================================================================
-- STEP 4: Create index for common dashboard queries
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_user_accounts_user_active
ON user_accounts(user_id, is_active);

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Migration 004 complete:';
  RAISE NOTICE '  - Added is_source_account column to user_accounts';
  RAISE NOTICE '  - Added unique constraint for one source per user';
  RAISE NOTICE '  - Added user_id to webhook_events';
END $$;
```

### Step 1.2: Apply Migration

1. Open Supabase Dashboard → SQL Editor
2. Copy the migration SQL above
3. Execute
4. Verify in Table Editor that `user_accounts` has `is_source_account` column

---

## Phase 2: Supabase Auth Setup (45 minutes)

### Step 2.1: Enable Google OAuth Provider

1. Go to Supabase Dashboard → Authentication → Providers
2. Enable **Google** provider
3. You'll need:
   - Google Client ID
   - Google Client Secret

### Step 2.2: Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create one)
3. Go to APIs & Services → Credentials
4. Click "Create Credentials" → "OAuth client ID"
5. Application type: **Web application**
6. Authorized redirect URIs: Add your Supabase callback URL:
   ```
   https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
   ```
7. Copy Client ID and Client Secret
8. Paste into Supabase Google provider settings
9. Save

### Step 2.3: Install Supabase Auth Dependencies

```bash
cd calconnect_backend
npm install @supabase/ssr
```

### Step 2.4: Create Auth Middleware

Create file: `calconnect_backend/middleware.ts`

```typescript
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({
            request: { headers: request.headers },
          })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({
            request: { headers: request.headers },
          })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Protect dashboard routes
  if (request.nextUrl.pathname.startsWith('/dashboard') && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Redirect logged-in users away from login
  if (request.nextUrl.pathname === '/login' && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: ['/dashboard/:path*', '/login'],
}
```

### Step 2.5: Create Auth Utility for Server Components

Create file: `calconnect_backend/lib/supabase-server.ts`

```typescript
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createClient() {
  const cookieStore = cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch (error) {
            // Handle cookies in Server Components
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch (error) {
            // Handle cookies in Server Components
          }
        },
      },
    }
  )
}

export async function getUser() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}
```

### Step 2.6: Create Auth Callback Route

Create file: `calconnect_backend/app/auth/callback/route.ts`

```typescript
import { createClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Return to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
```

---

## Phase 3: Login Page (30 minutes)

### Step 3.1: Create Login Page

Create file: `calconnect_backend/app/login/page.tsx`

```typescript
'use client'

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClientComponentClient()

  const handleGoogleLogin = async () => {
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f5f5f5'
    }}>
      <div style={{
        background: 'white',
        padding: '2rem',
        borderRadius: '8px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        width: '100%',
        maxWidth: '400px',
        textAlign: 'center'
      }}>
        <h1 style={{ marginBottom: '0.5rem' }}>CalConnect</h1>
        <p style={{ color: '#666', marginBottom: '2rem' }}>
          Calendar Mirroring Made Simple
        </p>

        {error && (
          <div style={{
            background: '#fee',
            color: '#c00',
            padding: '0.75rem',
            borderRadius: '4px',
            marginBottom: '1rem'
          }}>
            {error}
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          style={{
            width: '100%',
            padding: '0.75rem 1rem',
            background: '#4285f4',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '1rem',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1
          }}
        >
          {loading ? 'Signing in...' : 'Sign in with Google'}
        </button>

        <p style={{ marginTop: '2rem', fontSize: '0.85rem', color: '#999' }}>
          By signing in, you agree to connect your Google Calendar accounts.
        </p>
      </div>
    </div>
  )
}
```

### Step 3.2: Install Auth Helpers

```bash
npm install @supabase/auth-helpers-nextjs
```

---

## Phase 4: Dashboard UI (2 hours)

### Step 4.1: Create Dashboard Layout

Create file: `calconnect_backend/app/dashboard/layout.tsx`

```typescript
import { getUser } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      <header style={{
        background: 'white',
        padding: '1rem 2rem',
        borderBottom: '1px solid #eee',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h1 style={{ margin: 0, fontSize: '1.25rem' }}>CalConnect</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ color: '#666' }}>{user.email}</span>
          <form action="/auth/signout" method="post">
            <button type="submit" style={{
              padding: '0.5rem 1rem',
              background: '#eee',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}>
              Sign Out
            </button>
          </form>
        </div>
      </header>
      <main style={{ padding: '2rem' }}>
        {children}
      </main>
    </div>
  )
}
```

### Step 4.2: Create Sign Out Route

Create file: `calconnect_backend/app/auth/signout/route.ts`

```typescript
import { createClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST() {
  const supabase = createClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'))
}
```

### Step 4.3: Create Dashboard Page

Create file: `calconnect_backend/app/dashboard/page.tsx`

```typescript
'use client'

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

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

  const supabase = createClientComponentClient()

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
```

---

## Phase 5: API Endpoints (2 hours)

### Step 5.1: Create Accounts List Endpoint

Create file: `calconnect_backend/app/api/accounts/route.ts`

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  try {
    // Get authenticated user
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's accounts
    const { data: accounts, error } = await supabaseAdmin
      .from('user_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching accounts:', error)
      return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 })
    }

    return NextResponse.json({ accounts: accounts || [] })
  } catch (error: any) {
    console.error('Error in accounts endpoint:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
```

### Step 5.2: Create Sources List Endpoint

Create file: `calconnect_backend/app/api/sources/route.ts`

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: sources, error } = await supabaseAdmin
      .from('pipedream_sources')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching sources:', error)
      return NextResponse.json({ error: 'Failed to fetch sources' }, { status: 500 })
    }

    return NextResponse.json({ sources: sources || [] })
  } catch (error: any) {
    console.error('Error in sources endpoint:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
```

### Step 5.3: Create Set Source Account Endpoint

Create file: `calconnect_backend/app/api/accounts/[id]/set-source/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accountId = params.id

    // Verify user owns this account
    const { data: account, error: accountError } = await supabaseAdmin
      .from('user_accounts')
      .select('*')
      .eq('account_id', accountId)
      .eq('user_id', user.id)
      .single()

    if (accountError || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    // Check if user already has active sources (mirroring is active)
    const { data: activeSources } = await supabaseAdmin
      .from('pipedream_sources')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1)

    if (activeSources && activeSources.length > 0) {
      return NextResponse.json({
        error: 'Cannot change source while mirroring is active. Deactivate first.'
      }, { status: 400 })
    }

    // Clear any existing source flags for this user
    await supabaseAdmin
      .from('user_accounts')
      .update({ is_source_account: false })
      .eq('user_id', user.id)

    // Set this account as source
    const { error: updateError } = await supabaseAdmin
      .from('user_accounts')
      .update({ is_source_account: true })
      .eq('account_id', accountId)
      .eq('user_id', user.id)

    if (updateError) {
      console.error('Error setting source:', updateError)
      return NextResponse.json({ error: 'Failed to set source account' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error setting source account:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
```

### Step 5.4: Create Mirroring Activate Endpoint

Create file: `calconnect_backend/app/api/mirroring/activate/route.ts`

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase'
import { pipedream } from '@/lib/pipedream'

export async function POST() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check for existing active sources
    const { data: existingSources } = await supabaseAdmin
      .from('pipedream_sources')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1)

    if (existingSources && existingSources.length > 0) {
      return NextResponse.json({
        error: 'Mirroring is already active'
      }, { status: 400 })
    }

    // Get source account
    const { data: sourceAccount, error: sourceError } = await supabaseAdmin
      .from('user_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_source_account', true)
      .single()

    if (sourceError || !sourceAccount) {
      return NextResponse.json({
        error: 'No source account selected'
      }, { status: 400 })
    }

    // Get destination accounts
    const { data: destAccounts } = await supabaseAdmin
      .from('user_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .eq('is_source_account', false)

    if (!destAccounts || destAccounts.length === 0) {
      return NextResponse.json({
        error: 'No destination accounts. Connect at least 2 accounts.'
      }, { status: 400 })
    }

    // Construct webhook URL
    const webhookUrl = `${process.env.WEBHOOK_BASE_URL}/api/webhook?userId=${encodeURIComponent(user.id)}&accountId=${encodeURIComponent(sourceAccount.account_id)}&calendarId=primary`

    // Deploy instant source
    const instantSource = await pipedream.deploySource(
      user.id,
      sourceAccount.account_id,
      'primary',
      webhookUrl
    )

    // Deploy cancelled source
    const cancelledSource = await pipedream.deployCancelledEventSource(
      user.id,
      sourceAccount.account_id,
      'primary',
      webhookUrl,
      300
    )

    // Store sources in database
    const { error: insertError } = await supabaseAdmin
      .from('pipedream_sources')
      .insert([
        {
          user_id: user.id,
          account_id: sourceAccount.account_id,
          source_id: instantSource.data.id,
          calendar_id: 'primary',
          webhook_url: webhookUrl,
          is_active: true,
          source_type: 'instant'
        },
        {
          user_id: user.id,
          account_id: sourceAccount.account_id,
          source_id: cancelledSource.data.id,
          calendar_id: 'primary',
          webhook_url: webhookUrl,
          is_active: true,
          source_type: 'cancelled'
        }
      ])

    if (insertError) {
      // Clean up deployed sources
      try {
        await pipedream.deleteSource(instantSource.data.id, user.id)
        await pipedream.deleteSource(cancelledSource.data.id, user.id)
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError)
      }
      return NextResponse.json({ error: 'Failed to save source configuration' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error activating mirroring:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
```

### Step 5.5: Create Mirroring Deactivate Endpoint

Create file: `calconnect_backend/app/api/mirroring/deactivate/route.ts`

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase'
import { pipedream } from '@/lib/pipedream'

export async function POST() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get active sources
    const { data: activeSources, error: sourcesError } = await supabaseAdmin
      .from('pipedream_sources')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)

    if (sourcesError) {
      return NextResponse.json({ error: 'Failed to fetch sources' }, { status: 500 })
    }

    if (!activeSources || activeSources.length === 0) {
      return NextResponse.json({ error: 'No active mirroring to deactivate' }, { status: 400 })
    }

    // Delete sources from Pipedream
    const deletePromises = activeSources.map(source =>
      pipedream.deleteSource(source.source_id, user.id).catch(err => {
        console.error(`Failed to delete source ${source.source_id}:`, err)
        return null // Continue even if one fails
      })
    )

    await Promise.all(deletePromises)

    // Mark sources as inactive in database
    await supabaseAdmin
      .from('pipedream_sources')
      .update({ is_active: false })
      .eq('user_id', user.id)

    // Clear source account flag
    await supabaseAdmin
      .from('user_accounts')
      .update({ is_source_account: false })
      .eq('user_id', user.id)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deactivating mirroring:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
```

### Step 5.6: Update Connect Token Endpoint

Update `calconnect_backend/app/api/connect/token/route.ts` to use authenticated user:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { pipedream } from '@/lib/pipedream'
import { supabaseAdmin } from '@/lib/supabase'
import { createClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // Allow both authenticated user and explicit userId (for backwards compat)
    let userId: string

    if (user) {
      userId = user.id
    } else {
      const body = await request.json()
      userId = body.userId
    }

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check account limit (max 3)
    const { count } = await supabaseAdmin
      .from('user_accounts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_active', true)

    if (count && count >= 3) {
      return NextResponse.json({
        error: 'Maximum of 3 accounts allowed'
      }, { status: 400 })
    }

    // Generate connect token with webhook
    const webhookUri = `${process.env.WEBHOOK_BASE_URL}/api/connect/callback`
    const result = await pipedream.generateConnectToken(userId, webhookUri)

    // Store token mapping for callback lookup
    await supabaseAdmin
      .from('connect_tokens')
      .insert({
        connect_token: result.token,
        user_id: userId,
        expires_at: result.expires_at
      })

    return NextResponse.json({
      token: result.token,
      expiresAt: result.expires_at,
      connectLinkUrl: result.connectLinkUrl
    })
  } catch (error: any) {
    console.error('Error generating connect token:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate connect token' },
      { status: 500 }
    )
  }
}
```

---

## Phase 6: Update Root Page (15 minutes)

### Step 6.1: Create Root Redirect

Update `calconnect_backend/app/page.tsx`:

```typescript
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase-server'

export default async function Home() {
  const user = await getUser()

  if (user) {
    redirect('/dashboard')
  } else {
    redirect('/login')
  }
}
```

---

## Phase 7: Environment & Deployment (1 hour)

### Step 7.1: Update Environment Variables

Add to `.env.local`:

```bash
# Base URL for production (update for Vercel)
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# Ensure all existing vars are present
PIPEDREAM_CLIENT_ID=...
PIPEDREAM_CLIENT_SECRET=...
PIPEDREAM_PROJECT_ID=...
PIPEDREAM_ENVIRONMENT=development
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
WEBHOOK_BASE_URL=...
```

### Step 7.2: Deploy to Vercel

1. Push code to GitHub
2. Go to [Vercel Dashboard](https://vercel.com/dashboard)
3. Import your repository
4. Add environment variables:
   - All variables from `.env.local`
   - Update `NEXT_PUBLIC_BASE_URL` to your Vercel URL
   - Update `WEBHOOK_BASE_URL` to your Vercel URL
5. Deploy

### Step 7.3: Update Supabase Auth Callback

After deploying, update the Google OAuth redirect URI:
1. Go to Google Cloud Console → Credentials
2. Add new redirect URI: `https://YOUR-PROJECT.supabase.co/auth/v1/callback`

### Step 7.4: Update Pipedream Connect Callback

Update `WEBHOOK_BASE_URL` in Vercel to point to your production URL.

---

## Testing Checklist

After completing all phases, verify:

- [ ] Can log in with Google account
- [ ] Dashboard loads and shows user email
- [ ] Can connect first Google Calendar account
- [ ] Can connect second Google Calendar account
- [ ] Can select source account
- [ ] Can activate mirroring
- [ ] Creating event in source calendar creates mirror in destination
- [ ] Updating event in source calendar updates mirror
- [ ] Deleting event in source calendar removes mirror (within 5 min)
- [ ] Can deactivate mirroring
- [ ] Can log out

---

## Troubleshooting

### Auth Issues
- Check Google OAuth credentials match Supabase settings
- Verify redirect URI is correct in Google Cloud Console
- Check browser console for auth errors

### Webhook Issues
- Verify `WEBHOOK_BASE_URL` is accessible from internet
- Check Pipedream dashboard for source status and event history
- Look at Next.js console logs for webhook receipts

### Database Issues
- Verify migration 004 was applied
- Check Supabase logs for query errors
- Verify service role key has correct permissions

---

## Files Created/Modified Summary

**New Files:**
- `middleware.ts`
- `lib/supabase-server.ts`
- `app/auth/callback/route.ts`
- `app/auth/signout/route.ts`
- `app/login/page.tsx`
- `app/dashboard/layout.tsx`
- `app/dashboard/page.tsx`
- `app/api/accounts/route.ts`
- `app/api/accounts/[id]/set-source/route.ts`
- `app/api/sources/route.ts`
- `app/api/mirroring/activate/route.ts`
- `app/api/mirroring/deactivate/route.ts`
- `supabase/migrations/004_mvp_enhancements.sql`

**Modified Files:**
- `app/page.tsx`
- `app/api/connect/token/route.ts`
