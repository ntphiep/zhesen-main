'use client'

import { useEffect } from 'react'
import './globals.css'

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

  return (
    <html lang="vi" className="h-full antialiased">
      <body className="min-h-full">
        <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center px-6 py-12 text-center">
          <h1 className="text-3xl font-bold">Zhesen đang gặp sự cố</h1>
          <p className="mt-3 text-black/60">
            Trang không dựng được. Tải lại giúp trong phần lớn trường hợp.
          </p>
          <button
            type="button"
            onClick={retry}
            className="mt-8 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/80"
          >
            Tải lại
          </button>
          {error.digest && (
            <p className="mt-6 text-xs text-black/40">Mã lỗi: {error.digest}</p>
          )}
        </main>
      </body>
    </html>
  )
}
