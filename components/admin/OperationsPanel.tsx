'use client'
import { useState } from 'react'
import { postAdmin } from '@/lib/admin/browser'

type Feedback = { tone: 'ok' | 'bad'; text: string } | null

/** Flushes the dictionary cache, which otherwise holds data for up to 7 days. */
export function OperationsPanel() {
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  async function flush() {
    if (busy) return
    setBusy(true)
    const outcome = await postAdmin('/api/admin/cache')
    setFeedback(outcome.ok
      ? { tone: 'ok', text: `Flushed at ${new Date().toLocaleTimeString('vi-VN', { hour12: false })}.` }
      : { tone: 'bad', text: outcome.message })
    setBusy(false)
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black/10 px-4 py-3">
      <div>
        <div className="text-sm font-medium">Dictionary cache · 7 days</div>
        <p className="text-sm text-black/60">Flush after loading or editing data so the dictionary page reads the new version.</p>
      </div>
      <div className="flex items-center gap-3">
        {feedback && (
          <span role="status" className={`text-sm ${feedback.tone === 'ok' ? 'text-emerald-800' : 'text-rose-700'}`}>{feedback.text}</span>
        )}
        <button
          type="button"
          onClick={() => void flush()}
          disabled={busy}
          className="rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/[0.04] disabled:opacity-40"
        >
          Flush cache
        </button>
      </div>
    </div>
  )
}
