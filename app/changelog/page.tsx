export const metadata = {
  title: 'Changelog — CalConnect',
  description: 'What we shipped, what we\'re building, what\'s next.',
}

type Entry = {
  date?: string
  title: string
  body: string
  tag?: 'security' | 'ux' | 'billing' | 'infra' | 'launch'
}

const shipped: Entry[] = [
  {
    date: 'Jul 22, 2026',
    title: 'Cancel subscription without deleting your account',
    body: 'Stripe Billing Portal integration. During trial you can cancel and not get charged; the account and any settings stay. Previously you had to nuke your whole account to stop billing.',
    tag: 'billing',
  },
  {
    date: 'Jul 22, 2026',
    title: 'Sign out actually works now',
    body: 'Fixed a 405 error some folks hit when signing out. Landed on a home-page redirect instead.',
    tag: 'ux',
  },
  {
    date: 'Jul 21, 2026',
    title: 'Live on AppSumo Radar',
    body: 'Lifetime deal listing is live. Two calendars synchronized forever, $9. Real payments processing.',
    tag: 'launch',
  },
  {
    date: 'Jul 21, 2026',
    title: 'Separate signup and login pages',
    body: 'Login is login. Signup is signup. Both now support Google OAuth and email + password. Small thing, big UX improvement.',
    tag: 'ux',
  },
  {
    date: 'Jul 20, 2026',
    title: 'Two-screen AppSumo code redemption',
    body: 'Enter code first, then create your account, and it auto-claims. No more entering a code and getting an ambiguous error.',
    tag: 'ux',
  },
  {
    date: 'Jul 20, 2026',
    title: '7-day free trial on Basic and Pro',
    body: 'Card required at signup, no charge until day 7. Cancel any time before then without paying.',
    tag: 'billing',
  },
  {
    date: 'Jul 19, 2026',
    title: 'Reconnect flow when Google tokens expire',
    body: 'If Google invalidates your grant, we now detect it and show a banner asking you to reconnect that account. Previously mirroring would silently stop.',
    tag: 'infra',
  },
  {
    date: 'Jul 19, 2026',
    title: 'Self-service account deletion',
    body: 'Full teardown from the dashboard danger zone. Stops watches, revokes Google tokens, deletes all your data.',
    tag: 'security',
  },
  {
    date: 'Jul 18, 2026',
    title: 'Warning screen before the Google unverified prompt',
    body: 'Explains why Google shows "app not verified" while our verification is pending, so people don\'t bounce out of confusion.',
    tag: 'ux',
  },
  {
    date: 'Jul 17, 2026',
    title: 'Privacy Policy and Terms of Service',
    body: 'Real legal pages, linked in the footer. Written in plain English, not law-firm boilerplate.',
    tag: 'infra',
  },
]

const inFlight: Entry[] = [
  {
    title: 'Refresh tokens encrypted at rest',
    body: 'Google OAuth refresh tokens are currently stored unencrypted in our database. Shipping symmetric encryption via Postgres pgcrypto this week so that even a database dump would show only ciphertext. Rafter-flagged, prioritized.',
    tag: 'security',
  },
  {
    title: 'Collapse login + calendar-connect into one prompt',
    body: 'Right now signing up with Google, then connecting your first calendar, is two separate Google prompts. Google splits the scopes for security, but we can fold them into one at signup so it feels like one click.',
    tag: 'ux',
  },
  {
    title: 'Sharper landing page + empty-state copy',
    body: 'Reframing around the outcome ("stop double-booking yourself") instead of the mechanism ("mirror your calendars"). Adding a founder story so people understand why we built this.',
    tag: 'ux',
  },
  {
    title: 'Google OAuth verification submission',
    body: 'Recording the demo video, then submitting for Google\'s verification review. Approval takes 4-6 weeks. Once approved, the "unverified app" screen goes away.',
    tag: 'infra',
  },
]

const planned: Entry[] = [
  {
    title: 'Support inbox',
    body: 'support@calconnect.io routing to a real inbox with response SLAs. Currently email goes into the void.',
    tag: 'infra',
  },
  {
    title: 'Password reset flow',
    body: 'Trigger from the login page. Backend is wired via Supabase; UI just needs a "forgot password" link.',
    tag: 'ux',
  },
  {
    title: 'Encryption key rotation runbook',
    body: 'Documented process to rotate the refresh-token encryption key without downtime if it ever leaks.',
    tag: 'security',
  },
  {
    title: 'Analytics',
    body: 'Plausible or GA4 so we can see which changes actually move signup and trial-to-paid.',
    tag: 'infra',
  },
]

const tagStyles: Record<NonNullable<Entry['tag']>, { bg: string; fg: string; label: string }> = {
  security: { bg: '#fde8e8', fg: '#8b1b1b', label: 'Security' },
  ux:       { bg: '#eaf3ff', fg: '#0b4a99', label: 'UX' },
  billing:  { bg: '#e8f6ec', fg: '#0e6b2f', label: 'Billing' },
  infra:    { bg: '#f0eaff', fg: '#4a2fa8', label: 'Infra' },
  launch:   { bg: '#fff0e0', fg: '#a04e00', label: 'Launch' },
}

function TagChip({ tag }: { tag?: Entry['tag'] }) {
  if (!tag) return null
  const s = tagStyles[tag]
  return (
    <span style={{
      display: 'inline-block',
      background: s.bg,
      color: s.fg,
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: 0.3,
      padding: '2px 8px',
      borderRadius: 999,
      textTransform: 'uppercase',
      marginLeft: 10,
      verticalAlign: 'middle',
    }}>{s.label}</span>
  )
}

function EntryBlock({ e }: { e: Entry }) {
  return (
    <div style={{ padding: '1.25rem 0', borderBottom: '1px solid #eee5d6' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: '#1a1a1a' }}>
          {e.title}
          <TagChip tag={e.tag} />
        </h3>
        {e.date && (
          <span style={{ marginLeft: 'auto', color: '#8a7f6b', fontSize: '0.85rem', fontVariantNumeric: 'tabular-nums' }}>
            {e.date}
          </span>
        )}
      </div>
      <p style={{ margin: '0.4rem 0 0', color: '#4a4a45', lineHeight: 1.55, fontSize: '0.95rem' }}>{e.body}</p>
    </div>
  )
}

export default function Changelog() {
  return (
    <div style={{
      maxWidth: '760px',
      margin: '0 auto',
      padding: '4rem 1.5rem 6rem',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      color: '#1a1a1a',
      lineHeight: 1.6,
    }}>
      <a href="/" style={{ color: '#666', textDecoration: 'none', fontSize: '0.9rem' }}>← Back to CalConnect</a>

      <h1 style={{ fontSize: '2.25rem', marginTop: '1.5rem', marginBottom: '0.25rem' }}>Changelog</h1>
      <p style={{ color: '#666', marginBottom: '2.5rem' }}>
        Everything we&apos;ve shipped, what we&apos;re building right now, and what&apos;s coming next. Updated as we ship.
      </p>

      <h2 style={{ marginTop: '2.5rem', fontSize: '1.35rem', color: '#1a1a1a' }}>Shipped</h2>
      <div>{shipped.map((e, i) => <EntryBlock key={i} e={e} />)}</div>

      <h2 style={{ marginTop: '3rem', fontSize: '1.35rem', color: '#1a1a1a' }}>In flight</h2>
      <p style={{ color: '#8a7f6b', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Actively being built right now.</p>
      <div>{inFlight.map((e, i) => <EntryBlock key={i} e={e} />)}</div>

      <h2 style={{ marginTop: '3rem', fontSize: '1.35rem', color: '#1a1a1a' }}>Planned</h2>
      <p style={{ color: '#8a7f6b', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Committed but not started yet.</p>
      <div>{planned.map((e, i) => <EntryBlock key={i} e={e} />)}</div>

      <p style={{ marginTop: '3rem', color: '#8a7f6b', fontSize: '0.9rem' }}>
        Missing something you&apos;d like to see?{' '}
        <a href="mailto:nick@raxdigital.com" style={{ color: '#8a7f6b' }}>Email me.</a>
      </p>
    </div>
  )
}
