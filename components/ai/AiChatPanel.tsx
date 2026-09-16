'use client'
import { useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { callAi } from '@/lib/ai/browser'
import { useAiEnabled } from '@/lib/hooks/useAiEnabled'

/** Turns re-sent on every question, so the cap is what keeps one long session
 *  from costing more each time it is used. Matches `chatInput` in `lib/ai/tasks.ts`. */
const HISTORY = 12

type Turn = { role: 'user' | 'assistant'; text: string }

/** One line naming the page, so "từ này" in a question has a referent. The
 *  document title carries the headword on an entry page; the path carries the
 *  section everywhere else. */
function pageContext(path: string, title: string): string {
  const name = title.replace(/\s*[|·—-]\s*Zhesen\s*$/i, '').trim()
  return name && name !== 'Zhesen' ? `${name} (${path})` : path
}

/**
 * The assistant on every page.
 *
 * The other assistant features each answer one fixed question about one word.
 * A learner with an ordinary question -- why this preposition, is my sentence
 * right, what should I revise -- had nowhere to put it. Closed by default and
 * silent when the deployment has no model, so the button never appears where it
 * could only fail.
 */
export function AiChatPanel({ enabled: known }: { enabled?: boolean } = {}) {
  const enabled = useAiEnabled(known)
  const path = usePathname() || '/'
  const [open, setOpen] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  if (!enabled) return null

  async function send() {
    const text = draft.trim()
    if (!text || busy) return
    const next = [...turns, { role: 'user' as const, text }]
    setTurns(next)
    setDraft('')
    setError(null)
    setBusy(true)

    const outcome = await callAi('chat', {
      context: pageContext(path, typeof document === 'undefined' ? '' : document.title),
      messages: next.slice(-HISTORY),
    })
    setBusy(false)
    // The question stays on screen either way: a learner who has to retype what
    // they just asked stops asking.
    if (outcome.status === 'error') setError(outcome.message)
    else setTurns([...next, { role: 'assistant', text: outcome.data.reply }])
    endRef.current?.scrollIntoView({ block: 'end' })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 rounded-full bg-blue-700 px-4 py-3 text-sm font-medium text-white shadow-lg hover:bg-blue-800"
      >
        Hỏi gia sư
      </button>
    )
  }

  return (
    <aside
      aria-label="Trợ lý Zhesen"
      className="fixed bottom-5 right-5 z-40 flex max-h-[min(32rem,80vh)] w-[min(24rem,calc(100vw-2.5rem))] flex-col rounded-2xl border border-black/10 bg-white shadow-xl"
    >
      <header className="flex items-center gap-2 border-b border-black/10 px-4 py-3">
        <span className="mr-auto text-sm font-semibold">Gia sư Zhesen</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Đóng trợ lý"
          className="rounded-lg px-2 py-1 text-sm text-black/50 hover:bg-black/5"
        >
          Đóng
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
        {turns.length === 0 && (
          <p className="text-black/50">
            Hỏi về từ đang xem, nhờ sửa một câu, hoặc hỏi nên ôn gì tiếp. Câu trả lời do trợ lý sinh ra, chưa qua từ điển.
          </p>
        )}
        {turns.map((t, i) => (
          <p
            key={i}
            className={
              t.role === 'user'
                ? 'ml-6 rounded-xl bg-blue-50 px-3 py-2 whitespace-pre-wrap'
                : 'mr-6 rounded-xl bg-black/5 px-3 py-2 whitespace-pre-wrap'
            }
          >
            {t.text}
          </p>
        ))}
        {busy && <p className="text-black/50">Đang trả lời…</p>}
        {error && <p className="text-red-700">{error}</p>}
        <div ref={endRef} />
      </div>

      <form
        className="flex items-end gap-2 border-t border-black/10 px-3 py-3"
        onSubmit={(e) => { e.preventDefault(); void send() }}
      >
        <textarea
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter breaks the line: the questions here are
            // one or two lines, and a send button reached by mouse every time
            // is slower than the question is worth.
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() }
          }}
          aria-label="Câu hỏi cho gia sư"
          placeholder="Nhập câu hỏi…"
          className="flex-1 resize-none rounded-xl border border-black/15 px-3 py-2 text-sm outline-none focus:border-blue-600"
        />
        <button
          type="submit"
          disabled={busy || draft.trim() === ''}
          className="rounded-xl bg-blue-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Gửi
        </button>
      </form>
    </aside>
  )
}
