'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { NoticeBar, useNotice } from '@/components/ui/Notice'
import { postAdmin } from '@/lib/admin/browser'
import { PRIMARY, BUTTON } from '@/components/admin/Page'

/** Close one word page report through app/api/admin/content/route.ts, then re-read the
 *  page. Apply writes the suggestion as the sense's Vietnamese gloss. */
export function FeedbackActions({ id, canApply }: { id: number; canApply: boolean }) {
  const router = useRouter()
  const { notice, notify, dismiss } = useNotice()
  const [busy, setBusy] = useState(false)

  async function send(status: 'applied' | 'dismissed') {
    if (busy) return
    setBusy(true)
    const outcome = await postAdmin('/api/admin/content', { action: 'resolve_feedback', id, status })
    setBusy(false)
    if (!outcome.ok) return notify(outcome.message)
    notify(status === 'applied' ? 'Suggestion applied.' : 'Report dismissed.', 'info')
    router.refresh()
  }

  return (
    <div className="flex gap-2">
      {canApply && (
        <button
          type="button"
          onClick={() => void send('applied')}
          disabled={busy}
          className={PRIMARY}
        >
          Apply
        </button>
      )}
      <button
        type="button"
        onClick={() => void send('dismissed')}
        disabled={busy}
        className={BUTTON}
      >
        Dismiss
      </button>
      <NoticeBar notice={notice} onDismiss={dismiss} />
    </div>
  )
}
