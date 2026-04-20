import type { Metadata } from 'next'
import { Providers } from '@/components/providers'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'MOHSTORE - Game Services Marketplace',
  description: 'Task-based marketplace connecting gamers with professional game service providers',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
    <body className="bg-white font-sans antialiased text-black dark:bg-gray-900 dark:text-white">
  <ThemeProvider
    attribute="class"
    defaultTheme="system"
    enableSystem
    storageKey="theme"
    disableTransitionOnChange
  >
    <Providers>
      {children}
    </Providers>
    <Toaster richColors />
  </ThemeProvider>
  <Analytics />
  <SpeedInsights />
</body>
    </html>
  )
}
