export const metadata = {
  title: 'Terms of Service — CalConnect',
  description: 'The terms of using CalConnect.',
}

export default function TermsOfService() {
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

      <h1 style={{ fontSize: '2.25rem', marginTop: '1.5rem', marginBottom: '0.25rem' }}>Terms of Service</h1>
      <p style={{ color: '#666', marginBottom: '2.5rem' }}>Last updated: July 17, 2026</p>

      <p>
        These terms govern your use of CalConnect ("the Service"), operated by RAX Digital LLC ("we," "us," "our").
        By using the Service, you agree to these terms. If you don't agree, don't use the Service.
      </p>

      <h2 style={h2}>1. What CalConnect does</h2>
      <p>
        CalConnect mirrors events from one or more of your Google Calendar accounts to your other Google Calendar accounts
        as privacy-preserving "Busy" blocks. You connect the accounts, pick which are sources, and CalConnect keeps
        your availability in sync across all of them.
      </p>

      <h2 style={h2}>2. Your account</h2>
      <p>
        You need a Google account to use CalConnect. You are responsible for maintaining the security of the Google
        accounts you connect and for all activity that occurs under your CalConnect account. Notify us immediately at{' '}
        <a href="mailto:nick@raxdigital.com">nick@raxdigital.com</a> if you suspect unauthorized access.
      </p>

      <h2 style={h2}>3. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Service to violate any law or third party's rights</li>
        <li>Attempt to reverse-engineer, decompile, or interfere with the Service's operation</li>
        <li>Use the Service to send spam or otherwise abuse Google's Calendar API</li>
        <li>Connect calendars you do not own or have explicit permission to manage</li>
        <li>Attempt to access other users' accounts or data</li>
      </ul>
      <p>
        We may suspend or terminate accounts that violate these terms. If we suspend your account, we'll let you know why.
      </p>

      <h2 style={h2}>4. Payment (when applicable)</h2>
      <p>
        Some CalConnect features may require a paid subscription. Prices and features will be clearly shown before you subscribe.
        Subscriptions renew automatically until you cancel. You can cancel any time in your account settings; access continues
        through the end of the paid period. We don't refund partial periods except where required by law.
      </p>

      <h2 style={h2}>5. Your content and data</h2>
      <p>
        You retain all rights to your calendar data. We access only what's necessary to run the mirroring service,
        as described in our <a href="/privacy">Privacy Policy</a>. We do not claim ownership of your calendar content.
      </p>

      <h2 style={h2}>6. Service availability</h2>
      <p>
        We aim to keep CalConnect available around the clock but we don't guarantee uninterrupted service.
        Downtime may occur for maintenance, bug fixes, upstream Google API changes, or reasons outside our control.
        We aren't liable for calendar sync delays caused by Google, Vercel, Supabase, or your internet connection.
      </p>

      <h2 style={h2}>7. Third-party services</h2>
      <p>
        CalConnect relies on Google Calendar's API. Your use of Google Calendar is governed by Google's own terms.
        If Google changes its API in ways that break parts of CalConnect, we'll fix what we can as quickly as we can.
      </p>

      <h2 style={h2}>8. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, RAX Digital LLC, its owners, and its contributors are not liable
        for indirect, incidental, special, or consequential damages arising from your use of the Service, including
        missed meetings, lost opportunities, or scheduling errors. Our total liability in any 12-month period is
        capped at the greater of $100 or the amount you paid us for the Service in that period.
      </p>
      <p>
        The Service is provided "as is" without warranties of any kind, express or implied.
      </p>

      <h2 style={h2}>9. Termination</h2>
      <p>
        You can stop using the Service at any time by disconnecting your Google accounts and, optionally, deleting
        your CalConnect account (see the <a href="/privacy">Privacy Policy</a> for data deletion). We may terminate
        or suspend your access if you materially violate these terms.
      </p>

      <h2 style={h2}>10. Changes to these terms</h2>
      <p>
        We may update these terms as CalConnect evolves. If we make material changes, we'll update the "Last updated"
        date and notify you by email. Continued use of the Service after changes take effect means you accept the new terms.
      </p>

      <h2 style={h2}>11. Governing law</h2>
      <p>
        These terms are governed by the laws of the State of Texas, USA. Any disputes will be resolved in the state
        or federal courts located in Travis County, Texas.
      </p>

      <h2 style={h2}>12. Contact</h2>
      <p>
        RAX Digital LLC<br />
        Attn: CalConnect Legal<br />
        Email: <a href="mailto:nick@raxdigital.com">nick@raxdigital.com</a>
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
