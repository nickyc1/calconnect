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
      <body>{children}</body>
    </html>
  )
}
