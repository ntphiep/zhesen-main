'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { callAi } from '@/lib/ai/browser'
import { useAiEnabled } from '@/lib/hooks/useAiEnabled'
import { useModalDialog } from '@/lib/hooks/useModalDialog'
import { onAskAi, type AskAi } from '@/lib/ai/ask'

/** Turns are re-sent on every question, so this cap bounds the cost of one long
 *  session. Matches `chatInput` in `lib/ai/tasks.ts`. */
const HISTORY = 12

type Turn = { role: 'user' | 'assistant'; text: string }

/** One line naming the page, so "từ này" in a question has a referent. The document
 *  title carries the headword on an entry page, the path the section elsewhere. */
function pageContext(path: string, title: string): string {
  const name = title.replace(/\s*[|·—-]\s*Zhesen\s*$/i, '').trim()
  return name && name !== 'Zhesen' ? `${name} (${path})` : path
}

/** The entry a word page shows, so the route can read its gist and senses itself. */
function pageEntry(path: string): string | null {
  const m = path.match(/^\/dictionary\/(en|zh|es)\/([^/]+)$/)
  if (!m) return null
  try {
    return `${m[1]}:${decodeURIComponent(m[2])}`
  } catch {
    return null
  }
}

/**
 * The assistant on every page, for questions no fixed per-word task covers. Closed
 * by default, and silent when the deployment has no model, so the button never
 * appears where it could only fail.
 */
export function AiChatPanel({ enabled: known }: { enabled?: boolean } = {}) {
  const enabled = useAiEnabled(known)
  const path = usePathname() || '/'
  const [open, setOpen] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** The reply as it streams in, unchecked until `callAi` resolves. */
  const [partial, setPartial] = useState('')
  const stopRef = useRef<AbortController | null>(null)
  /** Bumped when a page asks about a new item, so a reply to the old thread writes nothing. */
  const threadRef = useRef(0)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const dialogRef = useModalDialog(open)
  /** An item a page asked about through `askAi`, kept for the page it came from. */
  const [asked, setAsked] = useState<(AskAi & { path: string }) | null>(null)
  const seed = asked?.path === path ? asked : null

  useEffect(() => onAskAi((detail) => {
    threadRef.current += 1
    stopRef.current?.abort()
    stopRef.current = null
    setBusy(false)
    setPartial('')
    setAsked({ ...detail, path })
    setTurns([])
    setError(null)
    setDraft(detail.draft)
    setOpen(true)
  }), [path])

  // After useModalDialog's effect, so showModal() has run and cannot move focus again.
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  if (!enabled) return null

  async function send() {
    const text = draft.trim()
    if (!text || busy) return
    const next = [...turns, { role: 'user' as const, text }]
    setTurns(next)
    setDraft('')
    setError(null)
    setBusy(true)
    const stop = new AbortController()
    stopRef.current = stop
    const thread = threadRef.current
    const live = () => thread === threadRef.current

    const entryId = pageEntry(path)
    try {
      const outcome = await callAi('chat', {
        context: pageContext(path, typeof document === 'undefined' ? '' : document.title),
        ...(entryId && { entryId }),
        // The item asked about leads every exchange, so it costs one turn of the cap.
        messages: seed ? [{ role: 'user', text: seed.seed }, ...next.slice(1 - HISTORY)] : next.slice(-HISTORY),
      }, stop.signal, (text) => {
        if (!live()) return
        setPartial(text)
        endRef.current?.scrollIntoView({ block: 'end' })
      })
      if (!live()) return
      // The question stays on screen either way, so a failure costs no retyping.
      if (outcome.status === 'error') setError(outcome.message)
      else setTurns([...next, { role: 'assistant', text: outcome.data.reply }])
    } catch (e) {
      // `callAi` handles fetch failures, but its dynamic task-module import rejects
      // after a redeploy, leaving the send button disabled for the life of the page.
      // An abort is the learner pressing Dừng, which needs no message.
      if (live() && (e as Error).name !== 'AbortError') setError('Chưa gửi được câu hỏi. Thử lại.')
    } finally {
      if (live()) {
        setBusy(false)
        setPartial('')
        stopRef.current = null
      }
    }
    endRef.current?.scrollIntoView({ block: 'end' })
  }

  // The launcher and the dialog both stay mounted: close() returns focus to the
  // launcher only while both are in the document. Modal's centred layout does not fit
  // a corner panel, so this shares its hook rather than the component.
  return (
    <>
      {/* Room under the last row of the page for the launcher: 20px offset plus its
          44px height, so the bottom control on a phone can scroll clear of it. */}
      <div aria-hidden="true" className="h-20 shrink-0" />
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 rounded-full bg-blue-700 px-4 py-3 text-sm font-medium text-white shadow-lg hover:bg-blue-800"
      >
        Hỏi AI
      </button>
      <dialog
        ref={dialogRef}
        aria-label="Hỏi AI"
        onClose={() => setOpen(false)}
        // No display utility on the dialog itself: `flex` would beat the UA's
        // `display: none` for a closed dialog. `top-auto left-auto` undo the UA's
        // `inset: 0`, which otherwise pins it to the top-left corner.
        className="fixed top-auto left-auto bottom-5 right-5 w-[min(24rem,calc(100vw-2.5rem))] rounded-2xl border border-black/10 bg-white p-0 shadow-xl"
      >
        {open && (
          <div className="flex max-h-[min(32rem,80vh)] flex-col">
            <header className="flex items-center gap-2 border-b border-black/10 px-4 py-3">
              <span className="mr-auto text-sm font-semibold">Hỏi AI</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Đóng"
                className="rounded-lg px-2 py-1 text-sm text-black/55 hover:bg-black/5"
              >
                Đóng
              </button>
            </header>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
              {turns.length === 0 && (
                <p className="text-black/55">
                  {seed
                    ? `Hỏi về ${seed.label}. Câu trả lời do AI viết.`
                    : 'Hỏi về từ đang xem, nhờ sửa câu hoặc hỏi nên ôn gì. Câu trả lời do AI viết, chưa qua từ điển.'}
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
              {busy && (partial
                ? <p className="mr-6 rounded-xl bg-black/5 px-3 py-2 whitespace-pre-wrap">{partial}</p>
                : <p className="text-black/55">Đang trả lời…</p>)}
              {error && <p className="text-red-700">{error}</p>}
              <div ref={endRef} />
            </div>

            <form
              className="flex items-end gap-2 border-t border-black/10 px-3 py-3"
              onSubmit={(e) => { e.preventDefault(); void send() }}
            >
              <textarea
                ref={inputRef}
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  // Enter sends, Shift+Enter breaks the line: questions here run one or
                  // two lines, and reaching for the button by mouse costs more.
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() }
                }}
                aria-label="Câu hỏi cho AI"
                placeholder="Nhập câu hỏi…"
                className="flex-1 resize-none rounded-xl border border-black/15 px-3 py-2 text-sm outline-none focus:border-blue-600"
              />
              {busy && (
                <button
                  type="button"
                  // The button unmounts once stopped, which would drop focus to the page.
                  onClick={() => { stopRef.current?.abort(); inputRef.current?.focus() }}
                  className="rounded-xl border border-black/15 px-3 py-2 text-sm font-medium"
                >
                  Dừng
                </button>
              )}
              <button
                type="submit"
                disabled={busy || draft.trim() === ''}
                className="rounded-xl bg-blue-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                Gửi
              </button>
            </form>
          </div>
        )}
      </dialog>
    </>
  )
}
