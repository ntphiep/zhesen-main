'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import s from '@/components/layout/Status.module.css'

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
    <main className={`${s.page} font-ui`}>
      <div aria-hidden="true" className={s.mark}><i /><i /><i /></div>
      <h1 className={s.title}>Có lỗi xảy ra</h1>
      <p className={s.lede}>
        Chưa tải được trang. Thử lại sau vài giây.
      </p>
      <div className={s.acts}>
        <button type="button" onClick={retry} className={s.btn}>
          Thử lại
        </button>
        <Link href="/" className={s.ghost}>
          Về trang chủ
        </Link>
      </div>
      {error.digest && (
        <p className={s.digest}>Mã lỗi: {error.digest}</p>
      )}
    </main>
  )
}
