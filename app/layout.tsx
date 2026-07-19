export const metadata = {
  title: 'CalConnect - Mirror Your Google Calendars',
  description: 'Keep your availability in sync across all your Google Calendar accounts.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1 }}>{children}</div>
        <footer style={{
          padding: '2rem 1.5rem',
          fontSize: '0.85rem',
          color: '#888',
          textAlign: 'center',
          borderTop: '1px solid #eee',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}>
          <div style={{ marginBottom: '0.5rem' }}>
            © 2026 RAX Digital LLC · CalConnect
          </div>
          <div>
            <a href="/privacy" style={{ color: '#888', textDecoration: 'none', margin: '0 0.75rem' }}>Privacy</a>
            <a href="/terms" style={{ color: '#888', textDecoration: 'none', margin: '0 0.75rem' }}>Terms</a>
            <a href="mailto:nick@raxdigital.com" style={{ color: '#888', textDecoration: 'none', margin: '0 0.75rem' }}>Contact</a>
          </div>
        </footer>
      </body>
    </html>
  )
}
