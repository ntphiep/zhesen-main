import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { AiChatPanel } from '@/components/ai/AiChatPanel'
import { aiConfig } from '@/lib/ai/config'
import { SITE_URL } from '@/lib/site'
import { THEME_BOOT_SCRIPT } from '@/lib/theme'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const DESCRIPTION =
  'Từ điển và sổ tay từ vựng cho người Việt học tiếng Trung, Tây Ban Nha và Anh. ' +
  'Tra từ hai chiều với tiếng Việt, lưu vào sổ tay rồi ôn lại.'

export const metadata: Metadata = {
  // Without it every relative URL in a metadata field is a build error, and the
  // Open Graph tags would have to repeat the host in each route.
  metadataBase: new URL(SITE_URL),
  // `default` is what the home page and any route without its own title get;
  // `template` is what the others are wrapped in, so a page declares only its own
  // name and the suffix stays consistent.
  title: { default: 'Zhesen · Từ điển Trung, Tây Ban Nha, Anh', template: '%s · Zhesen' },
  description: DESCRIPTION,
  applicationName: 'Zhesen',
  openGraph: {
    type: 'website',
    siteName: 'Zhesen',
    locale: 'vi_VN',
    url: '/',
    title: 'Zhesen · Từ điển Trung, Tây Ban Nha, Anh',
    description: DESCRIPTION,
  },
  // No image is declared on purpose: a card pointing at a missing file renders
  // worse than a card with no image at all.
  twitter: { card: 'summary' },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="vi"
      className={`${geistSans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies the stored light/dark choice before the first paint. In <head> and
            not in an effect: an effect runs after the page has already been painted in
            the wrong scheme. It writes the attribute the server did not render, which
            is what suppressHydrationWarning above covers. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        <div className="flex-1">{children}</div>
        {/* Answered here rather than by a request after hydration: aiConfig() only
            reads environment variables, so it costs nothing and does not opt the
            layout into dynamic rendering. */}
        <AiChatPanel enabled={aiConfig() !== null} />
      </body>
    </html>
  )
}
