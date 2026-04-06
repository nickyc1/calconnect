import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase-server'

export default async function Home() {
  const user = await getUser()

  if (user) {
    redirect('/dashboard')
  }

  return (
    <div style={{
      maxWidth: '600px',
      margin: '0 auto',
      padding: '4rem 1rem',
      textAlign: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>CalConnect</h1>
      <p style={{ fontSize: '1.2rem', color: '#666', marginBottom: '2rem' }}>
        Mirror your Google Calendars. Stay available everywhere.
      </p>

      <div style={{
        background: '#f9fafb',
        borderRadius: '8px',
        padding: '2rem',
        marginBottom: '2rem',
        textAlign: 'left',
        border: '1px solid #e5e7eb'
      }}>
        <p style={{ margin: '0 0 1rem 0', color: '#374151' }}>
          If you have multiple Google Calendar accounts (work, personal, side projects),
          CalConnect keeps your availability in sync across all of them.
        </p>
        <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#6b7280' }}>
          <li style={{ marginBottom: '0.5rem' }}>Events appear as "Busy" blocks in your other calendars</li>
          <li style={{ marginBottom: '0.5rem' }}>Real-time sync via Google Calendar push notifications</li>
          <li style={{ marginBottom: '0.5rem' }}>Recurring events, updates, and deletions all handled</li>
          <li>Privacy-preserving: only blocks time, never shares details</li>
        </ul>
      </div>

      <a
        href="/login"
        style={{
          display: 'inline-block',
          padding: '0.875rem 2rem',
          background: '#4285f4',
          color: 'white',
          textDecoration: 'none',
          borderRadius: '6px',
          fontSize: '1rem',
          fontWeight: 500,
        }}
      >
        Sign in with Google
      </a>
    </div>
  )
}
