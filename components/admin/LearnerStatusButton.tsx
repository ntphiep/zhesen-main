'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { NoticeBar, useNotice } from '@/components/ui/Notice'
import { postAdmin } from '@/lib/admin/browser'
import { PRIMARY, BUTTON } from '@/components/admin/Page'

/** Hide a published layer from the word page, or publish a hidden one, through
 *  app/api/admin/learner/route.ts, then re-read the page. */
export function LearnerStatusButton({ entryId, status }: { entryId: string; status: 'published' | 'hidden' }) {
  const router = useRouter()
  const { notice, notify, dismiss } = useNotice()
  const [busy, setBusy] = useState(false)
  const next = status === 'published' ? 'hidden' : 'published'

  async function send() {
    if (busy) return
    setBusy(true)
    const outcome = await postAdmin('/api/admin/learner', { entryId, status: next })
    setBusy(false)
    if (!outcome.ok) return notify(outcome.message)
    notify(next === 'hidden' ? 'Layer hidden.' : 'Layer published.', 'info')
    router.refresh()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void send()}
        disabled={busy}
        className={status === 'published'
          ? BUTTON
          : PRIMARY}
      >
        {status === 'published' ? 'Hide' : 'Publish'}
      </button>
      <NoticeBar notice={notice} onDismiss={dismiss} />
    </>
  )
}
