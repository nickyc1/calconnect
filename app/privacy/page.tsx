export const metadata = {
  title: 'Privacy Policy — CalConnect',
  description: 'How CalConnect handles your Google Calendar data.',
}

export default function PrivacyPolicy() {
  return (
    <div style={{
      maxWidth: '760px',
      margin: '0 auto',
      padding: '4rem 1.5rem 6rem',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      color: '#1a1a1a',
      lineHeight: 1.65,
    }}>
      <a href="/" style={{ color: '#666', textDecoration: 'none', fontSize: '0.9rem' }}>← Back to CalConnect</a>

      <h1 style={{ fontSize: '2.25rem', marginTop: '1.5rem', marginBottom: '0.25rem' }}>Privacy Policy</h1>
      <p style={{ color: '#666', marginBottom: '2.5rem' }}>Last updated: July 17, 2026</p>

      <p>
        CalConnect ("we," "us") is a Google Calendar mirroring tool operated by RAX Digital LLC.
        This policy explains what information we collect, how we use it, and the controls you have.
        Questions? Email <a href="mailto:n.christensen4@gmail.com">n.christensen4@gmail.com</a>.
      </p>

      <h2 style={h2}>What data we access</h2>
      <p>When you connect a Google Calendar account, you grant CalConnect access to:</p>
      <ul>
        <li>Your Google account email address (for identifying which calendar is which)</li>
        <li>Your calendar events on connected calendars (to detect changes and create mirrored "Busy" blocks)</li>
        <li>Permission to create, update, and delete events on your calendars (to write the mirrored "Busy" blocks and clean them up when source events change)</li>
      </ul>

      <h2 style={h2}>What data we store</h2>
      <ul>
        <li>Your email address and CalConnect account ID</li>
        <li>Google OAuth tokens (refresh token, access token) so we can keep your calendars in sync without repeated sign-ins</li>
        <li>The Google event IDs of source events and their mirrored counterparts, so we know which mirrors to update or delete</li>
        <li>Webhook channel metadata (channel ID, resource ID, expiration) required by Google Calendar's push notification API</li>
      </ul>

      <h2 style={h2}>What we don't store</h2>
      <ul>
        <li>Event titles, descriptions, attendees, or locations from your source calendars</li>
        <li>Any content of your calendar events beyond the timestamps we need to create matching "Busy" blocks</li>
      </ul>
      <p>
        The mirrored events we create in your other calendars contain only the word "Busy" and the time range.
        Titles, attendees, notes, and links from the source event are never copied or shared.
      </p>

      <h2 style={h2}>How we use your data</h2>
      <p>
        We use the data described above solely to provide the calendar mirroring service you signed up for.
        Specifically:
      </p>
      <ul>
        <li>Receive Google Calendar push notifications when your source events change</li>
        <li>Create, update, and delete "Busy" mirror events on your destination calendars</li>
        <li>Refresh your access tokens automatically so mirroring keeps working</li>
        <li>Send you occasional service emails (billing, security, major product changes) — never marketing spam</li>
      </ul>

      <h2 style={h2}>Google API Services User Data Policy</h2>
      <p>
        CalConnect's use and transfer of information received from Google APIs adheres to the{' '}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
          Google API Services User Data Policy
        </a>, including the Limited Use requirements.
      </p>
      <p>Specifically, CalConnect:</p>
      <ul>
        <li>Only uses your Google user data to provide the calendar mirroring functionality you requested</li>
        <li>Does not use your data for advertising, targeting, or ad personalization</li>
        <li>Does not sell your data to third parties</li>
        <li>Does not allow humans to read your data except (a) with your explicit permission, (b) to comply with applicable law, (c) as necessary to investigate a specific abuse report, or (d) to perform limited debugging where data is aggregated and anonymized</li>
        <li><strong>Does not use your Google Workspace data (raw, aggregated, or derived) to develop, train, refine, or improve any AI or machine learning models</strong>, whether operated by CalConnect or by any third party</li>
        <li>Does not transfer your Google Workspace data to any third-party AI or machine learning service</li>
      </ul>
      <p>
        <strong>Limited Use Compliance Statement:</strong> The use of raw or derived user data received
        from Google Workspace APIs by CalConnect will adhere to the{' '}
        <a href="https://developers.google.com/workspace/workspace-api-user-data-developer-policy" target="_blank" rel="noopener noreferrer">
          Google Workspace API User Data and Developer Policy
        </a>, including the Limited Use requirements.
      </p>

      <h2 style={h2}>Data storage and security</h2>
      <p>
        User accounts and OAuth tokens are stored in a Supabase-managed Postgres database in the US East region,
        encrypted at rest by Supabase and accessed only over TLS. Application code runs on Vercel.
        We use standard industry practices to prevent unauthorized access. No system is perfectly secure;
        if we ever suffer a breach that affects your data, we will notify you promptly.
      </p>

      <h2 style={h2}>Data retention and deletion</h2>
      <p>
        Your data is retained for as long as your CalConnect account is active. You can:
      </p>
      <ul>
        <li>Disconnect a Google account from your CalConnect dashboard, which deletes the stored tokens for that account and stops the mirroring watch channels</li>
        <li>Delete your CalConnect account entirely by emailing <a href="mailto:n.christensen4@gmail.com">n.christensen4@gmail.com</a>. All associated data is deleted within 30 days.</li>
        <li>Revoke CalConnect's access from your Google account at any time by visiting <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">myaccount.google.com/permissions</a></li>
      </ul>

      <h2 style={h2}>Third parties</h2>
      <p>We share data with the minimum set of infrastructure providers required to run the service:</p>
      <ul>
        <li><strong>Google</strong> — Calendar API and OAuth. Your calendar data lives with Google; we just orchestrate it.</li>
        <li><strong>Supabase</strong> — database and authentication hosting.</li>
        <li><strong>Vercel</strong> — application hosting.</li>
      </ul>
      <p>We do not share your data with advertisers, analytics vendors, or data brokers.</p>

      <h2 style={h2}>Your rights</h2>
      <p>
        You have the right to access, correct, or delete your personal data. To exercise any of these rights,
        email <a href="mailto:n.christensen4@gmail.com">n.christensen4@gmail.com</a>. We respond within 30 days.
      </p>

      <h2 style={h2}>Changes to this policy</h2>
      <p>
        If we change this policy in a material way, we will update the "Last updated" date at the top and,
        for significant changes, notify you by email.
      </p>

      <h2 style={h2}>Contact</h2>
      <p>
        RAX Digital LLC<br />
        Attn: CalConnect Privacy<br />
        Email: <a href="mailto:n.christensen4@gmail.com">n.christensen4@gmail.com</a>
      </p>
    </div>
  )
}

const h2 = {
  fontSize: '1.35rem',
  fontWeight: 600,
  marginTop: '2.5rem',
  marginBottom: '0.75rem',
} as const
