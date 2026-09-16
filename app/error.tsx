'use client'

import { useEffect } from 'react'
import Link from 'next/link'

/**
 * The boundary for anything a page throws below the root layout: a Supabase read
 * that failed, a count that refused to answer. Without it Next unmounts the whole
 * tree and shows its own error page, so a transient database blip looked like the
 * site had gone.
 *
 * The button calls `retry`, not `reset`. Next 16.3 documents the difference:
 * `reset()` clears the error state and re-renders the children without fetching
 * again, so a failed Supabase read would be re-rendered from the same failure.
 * `retry()` re-fetches, which is the only thing that can help here. See
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md.
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    // The message itself never reaches the page: it can carry a row id or a
    // PostgREST hint, and neither means anything to a learner. The console keeps
    // it for whoever is debugging, and `digest` is what ties this screen to the
    // server log entry.
    console.error(error)
  }, [error])

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-8rem)] max-w-xl flex-col items-center justify-center px-6 py-12 text-center">
      <h1 className="text-3xl font-bold">Có lỗi xảy ra</h1>
      <p className="mt-3 text-black/60">
        Trang này không tải được. Thử lại sau vài giây; nếu vẫn vậy thì lỗi nằm ở phía máy chủ.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={retry}
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/80"
        >
          Thử lại
        </button>
        <Link
          href="/"
          className="rounded-lg border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5"
        >
          Về trang chủ
        </Link>
      </div>
      {error.digest && (
        <p className="mt-6 text-xs text-black/40">Mã lỗi: {error.digest}</p>
      )}
    </main>
  )
}
