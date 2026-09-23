'use client'
import { useState } from 'react'
import { postAdmin } from '@/lib/admin/browser'
import type { Integration } from '@/lib/admin/cache'

type Feedback = { tone: 'ok' | 'bad'; text: string } | null

/** The cache flush and whether each outside service is configured. */
export function OperationsPanel({ integrations }: { integrations: Integration[] }) {
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  async function flush() {
    if (busy) return
    setBusy(true)
    const outcome = await postAdmin('/api/admin/cache')
    setFeedback(outcome.ok
      ? { tone: 'ok', text: `Đã làm mới cache từ điển lúc ${new Date().toLocaleTimeString('vi-VN')}.` }
      : { tone: 'bad', text: outcome.message })
    setBusy(false)
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl border border-black/10 px-4 py-3">
        <h3 className="font-medium">Cache từ điển</h3>
        <p className="mt-1 text-sm text-black/60">
          Trang từ điển giữ dữ liệu tối đa 7 ngày. Làm mới sau khi nạp hoặc sửa dữ liệu để lần tải kế tiếp đọc bản mới.
        </p>
        <button
          type="button"
          onClick={() => void flush()}
          disabled={busy}
          className="mt-3 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Làm mới cache
        </button>
        {feedback && (
          <p role="status" className={`mt-2 text-sm ${feedback.tone === 'ok' ? 'text-green-700' : 'text-red-600'}`}>
            {feedback.text}
          </p>
        )}
      </div>
      <div className="rounded-xl border border-black/10 px-4 py-3">
        <h3 className="font-medium">Dịch vụ ngoài</h3>
        <ul className="mt-2 flex flex-col gap-1.5 text-sm">
          {integrations.map((i) => (
            <li key={i.label} className="flex items-center justify-between gap-3">
              <span>{i.label}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${i.enabled ? 'bg-green-600/10 text-green-700' : 'bg-black/5 text-black/50'}`}>
                {i.enabled ? 'Đã cấu hình' : 'Chưa cấu hình'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
