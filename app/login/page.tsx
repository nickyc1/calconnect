'use client'

import { createBrowserClient } from '@supabase/ssr'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

// Whitelist of paths we're willing to redirect to after login. Never redirect
// to a user-supplied external URL — that's an open-redirect vector.
const ALLOWED_NEXT = new Set(['/dashboard', '/redeem', '/onboarding'])

// Next.js 14 requires useSearchParams() to sit inside a Suspense boundary
// during static prerender. Wrap the real page content in one.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  )
}

function LoginContent() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const rawNext = searchParams.get('next') || ''
  const next = ALLOWED_NEXT.has(rawNext) ? rawNext : '/dashboard'

  const handleGoogleLogin = async () => {
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
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
          Mirror your Google Calendars. Stay available everywhere.
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

        <div style={{
          background: '#fff8e1',
          border: '1px solid #f0d174',
          borderRadius: '8px',
          padding: '0.9rem 1rem',
          marginBottom: '1.25rem',
          textAlign: 'left',
          fontSize: '0.85rem',
          lineHeight: 1.5,
          color: '#5c4a10'
        }}>
          <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>
            Heads up: Google will show a warning
          </div>
          <div>
            We&apos;re finalizing Google&apos;s verification (4-6 weeks). Until then, you&apos;ll see &quot;Google hasn&apos;t verified this app&quot;.
            Click <strong>Advanced</strong> → <strong>Go to CalConnect (unsafe)</strong> to continue. Your data stays private — see our{' '}
            <a href="/privacy" style={{ color: '#5c4a10', textDecoration: 'underline' }}>Privacy Policy</a>.
          </div>
        </div>

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
