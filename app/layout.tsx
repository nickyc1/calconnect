export const metadata = {
  title: 'CalConnect — Google Calendars, synchronized',
  description: 'One place blocks time on the others. Real-time. Privacy-preserving. Zero manual work after 90 seconds of setup.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  )
}
