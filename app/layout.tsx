import type { Metadata } from 'next'
import { Be_Vietnam_Pro, Geist } from 'next/font/google'
import './globals.css'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { AiChatPanel } from '@/components/ai/AiChatPanel'
import { SITE_URL } from '@/lib/site'
import { THEME_BOOT_SCRIPT } from '@/lib/theme'
import { WORD_LAYOUT_BOOT_SCRIPT } from '@/lib/dictionary/wordLayout'

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
      </head>
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        <div className="flex-1">{children}</div>
        <SiteFooter />
        {/* Asks GET /api/ai after hydration: the answer depends on the account and on
            SSM, and reading either here would make every page dynamic. */}
        <AiChatPanel />
      </body>
    </html>
  )
}
