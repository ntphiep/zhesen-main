'use client'

import { useEffect } from 'react'
import { Be_Vietnam_Pro } from 'next/font/google'
import { DARK_QUERY, THEME_KEY, parseTheme, resolveTheme } from '@/lib/theme'
import s from '@/components/layout/Status.module.css'
import './globals.css'

// This document replaces the root layout, so it declares the UI face the layout would.
const beVietnamPro = Be_Vietnam_Pro({
  variable: '--font-be-vietnam-pro',
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '600', '700', '800'],
})

/**
 * The last boundary. `app/error.tsx` sits inside the root layout and cannot
 * catch what the layout itself throws, so that case would otherwise reach the
 * framework's own fallback. This one replaces the whole document, which is why
 * it has to render `<html>` and `<body>` itself and cannot use SiteHeader.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  // The stored scheme. Next draws this page in the browser, where an inline boot script never runs.
  useEffect(() => {
    let stored: string | null = null
    try { stored = localStorage.getItem(THEME_KEY) } catch { /* storage blocked: follow the system */ }
    document.documentElement.dataset.theme = resolveTheme(parseTheme(stored), window.matchMedia(DARK_QUERY).matches)
  }, [])

  return (
    <html lang="vi" className={`${beVietnamPro.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full">
        <main data-full="" className={`${s.page} font-ui`}>
          <div aria-hidden="true" className={s.mark}><i /><i /><i /></div>
          <h1 className={s.title}>Zhesen đang gặp sự cố</h1>
          <p className={s.lede}>
            Chưa mở được trang. Tải lại trang.
          </p>
          <div className={s.acts}>
            <button type="button" onClick={retry} className={s.btn}>
              Tải lại
            </button>
          </div>
          {error.digest && (
            <p className={s.digest}>Mã lỗi: {error.digest}</p>
          )}
        </main>
      </body>
    </html>
  )
}
