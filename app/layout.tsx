import { Fraunces, Inter } from 'next/font/google'

const fraunces = Fraunces({
  weight: ['400', '500'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
  variable: '--font-serif-display',
  display: 'swap',
})

const inter = Inter({
  weight: ['400', '500', '600'],
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

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
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  )
}
