import { Gelasio, Inter } from 'next/font/google'

const gelasio = Gelasio({
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
  metadataBase: new URL('https://www.calconnect.io'),
  title: 'CalConnect — Google Calendars, synchronized',
  description: 'One place blocks time on the others. Real-time. Privacy-preserving. Zero manual work after 90 seconds of setup.',
  openGraph: {
    title: 'CalConnect — Google Calendars, synchronized',
    description: 'Never double-book yourself again. One place blocks time on the others. Real-time, privacy-preserving mirror across every Google Calendar you own.',
    url: 'https://www.calconnect.io',
    siteName: 'CalConnect',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'CalConnect — Google Calendars, synchronized. Never double-book yourself again.',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CalConnect — Google Calendars, synchronized',
    description: 'Never double-book yourself again. One place blocks time on the others.',
    images: ['/og-image.png'],
  },
  icons: {
    icon: [
      { url: '/logo-512.png', sizes: '512x512', type: 'image/png' },
      { url: '/android-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/logo-512.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${gelasio.variable} ${inter.variable}`}>
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  )
}
