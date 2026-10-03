import type { Metadata } from 'next'
import { Be_Vietnam_Pro, Geist } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import './globals.css'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { AiChatPanel } from '@/components/ai/AiChatPanel'
import { SITE_SOCIAL, SITE_URL } from '@/lib/site'
import { THEME_BOOT_SCRIPT } from '@/lib/theme'
import { WORD_LAYOUT_BOOT_SCRIPT } from '@/lib/dictionary/wordLayout'
import { HOME_BOOT_SCRIPT } from '@/lib/home/homeLayout'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

// Not a variable font on Google Fonts, so each weight is a file: only the four the chrome draws.
const beVietnamPro = Be_Vietnam_Pro({
  variable: '--font-be-vietnam-pro',
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '600', '700', '800'],
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
    ...SITE_SOCIAL.openGraph,
    url: '/',
    title: 'Zhesen · Từ điển Trung, Tây Ban Nha, Anh',
    description: DESCRIPTION,
  },
  twitter: SITE_SOCIAL.twitter,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="vi"
      className={`${geistSans.variable} ${beVietnamPro.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies the stored light/dark choice before the first paint. In <head> and
            not in an effect: an effect runs after the page has already been painted in
            the wrong scheme. It writes the attribute the server did not render, which
            is what suppressHydrationWarning above covers. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        {/* The word page's layout choice, for the same reason: the page is cached for
            everyone in the default layout, so another one has to be known before paint. */}
        <script dangerouslySetInnerHTML={{ __html: WORD_LAYOUT_BOOT_SCRIPT }} />
        {/* `/` is cached for visitors and readers alike: whether this browser holds a
            session, and which home layout it picked, have to be known before paint too. */}
        <script dangerouslySetInnerHTML={{ __html: HOME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        <div className="flex-1">{children}</div>
        <SiteFooter />
        {/* Asks GET /api/ai after hydration: the answer depends on the account and on
            SSM, and reading either here would make every page dynamic. */}
        <AiChatPanel />
        {/* A production build loads both from /_vercel on this origin, so the CSP in
            next.config.ts needs no new host. */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
