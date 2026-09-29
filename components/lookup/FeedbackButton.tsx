'use client'
import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { FEEDBACK_MESSAGE_MAX, FEEDBACK_SUGGESTION_MAX, type FeedbackKind } from '@/lib/dictionary/feedback'
import { senseLabel, senseSections } from '@/lib/dictionary/wordPage'
import type { DictSense } from '@/lib/dictionary/types'

const KINDS: [FeedbackKind, string][] = [['meaning', 'Nghĩa sai'], ['example', 'Ví dụ sai'], ['other', 'Khác']]

type Sent = 'idle' | 'sending' | 'sent' | 'failed'

const FIELD = 'rounded-lg border border-black/15 bg-white px-3 py-2 text-sm'

/**
 * "Góp ý" on the word page, posting to app/dictionary/feedback/route.ts. The page is cached
 * for everyone, so nothing here reads the session: the route attaches the account itself.
 * The dialog mounts on first open, so the cached HTML carries only the button.
 */
export function FeedbackButton({ entryId, senses }: { entryId: string; senses: DictSense[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="whitespace-nowrap rounded-lg border border-black/15 bg-white px-2 py-1.5 text-sm font-medium text-black/70 hover:text-black"
      >
        Góp ý
      </button>
      {open && <FeedbackDialog entryId={entryId} senses={senses} onClose={() => setOpen(false)} />}
    </>
  )
}

export function FeedbackDialog({ entryId, senses, onClose }: {
  entryId: string
  senses: DictSense[]
  onClose: () => void
}) {
  // The senses in the order the page lists them, each under its first Vietnamese term.
  const options = useMemo(() => senseSections(senses)
    .flatMap((sec) => sec.senses)
    .filter((s): s is DictSense & { id: string } => Boolean(s.id))
    .map((s, i) => ({ id: s.id, label: `${i + 1}. ${senseLabel(s)}` })), [senses])
  const [senseId, setSenseId] = useState('')
  const [kind, setKind] = useState<FeedbackKind>('meaning')
  const [message, setMessage] = useState('')
  const [suggestion, setSuggestion] = useState('')
  const [sent, setSent] = useState<Sent>('idle')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim() || sent === 'sending') return
    setSent('sending')
    try {
      const res = await fetch('/dictionary/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          entryId, senseId: senseId || null, kind, message, suggestion: suggestion.trim() || null,
        }),
      })
      setSent(res.ok ? 'sent' : 'failed')
    } catch {
      setSent('failed')
    }
  }

  return (
    <Modal open onClose={onClose} title="Góp ý" titleId="word-feedback-title" widthClass="max-w-md">
      {sent === 'sent' ? (
        <div className="flex flex-col gap-4 p-5">
          <p role="status" className="text-sm">Đã gửi góp ý.</p>
          <div className="flex justify-end">
            <button type="button" onClick={onClose} className="rounded-lg bg-black px-4 py-2 text-sm text-white">Đóng</button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3 p-5">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-black/55">Nghĩa</span>
            <select value={senseId} onChange={(e) => setSenseId(e.target.value)} className={FIELD}>
              <option value="">Cả từ</option>
              {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-xs text-black/55">Loại</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {KINDS.map(([value, label]) => (
                <label key={value} className="flex items-center gap-1.5 text-sm">
                  <input type="radio" name="feedback-kind" value={value} checked={kind === value} onChange={() => setKind(value)} />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-black/55">Vì sao sai</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              maxLength={FEEDBACK_MESSAGE_MAX}
              rows={3}
              className={FIELD}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-black/55">Nghĩa đúng</span>
            <input
              type="text"
              value={suggestion}
              onChange={(e) => setSuggestion(e.target.value)}
              maxLength={FEEDBACK_SUGGESTION_MAX}
              className={FIELD}
            />
          </label>
          {sent === 'failed' && <p role="alert" className="text-sm text-rose-700">Chưa gửi được. Thử lại.</p>}
          <div className="mt-1 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-black/15 px-4 py-2 text-sm">Hủy</button>
            <button
              type="submit"
              disabled={!message.trim() || sent === 'sending'}
              className="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-40"
            >
              Gửi
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
