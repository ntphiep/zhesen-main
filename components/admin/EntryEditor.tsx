'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { NoticeBar, useNotice } from '@/components/ui/Notice'
import { postAdmin } from '@/lib/admin/browser'
import { glossWarning, type AdminEntry, type AdminSense } from '@/lib/admin/content'
import { entryPath } from '@/lib/dictionary/entryId'

type Notify = (text: string, tone?: 'error' | 'info') => void

function SenseForm({ sense, onSaved, notify }: { sense: AdminSense; onSaved: () => void; notify: Notify }) {
  const [glossVi, setGlossVi] = useState(sense.glossVi ?? '')
  const [glossEn, setGlossEn] = useState(sense.glossEn ?? '')
  const [busy, setBusy] = useState(false)
  const warning = glossWarning(glossVi)
  const changed = glossVi !== (sense.glossVi ?? '') || glossEn !== (sense.glossEn ?? '')

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    const outcome = await postAdmin('/api/admin/content', {
      action: 'update_sense', senseId: sense.id, glossVi, glossEn,
    })
    setBusy(false)
    if (!outcome.ok) return notify(outcome.message)
    notify(`Saved sense ${sense.senseOrder}.`, 'info')
    onSaved()
  }

  return (
    <form onSubmit={save} className="rounded-xl border border-black/10 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-black/50">
        <span className="font-medium text-black/70">Sense {sense.senseOrder}</span>
        {sense.pos && <span>{sense.pos}</span>}
        {sense.glossViIsMt && (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-800">Machine-translated, not reviewed</span>
        )}
      </div>
      <label className="mt-2 block text-sm">
        Vietnamese gloss
        <textarea
          value={glossVi}
          onChange={(e) => setGlossVi(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm"
        />
      </label>
      {warning && <p className="mt-1 text-sm text-amber-700">{warning}</p>}
      <label className="mt-2 block text-sm">
        English gloss
        <textarea
          value={glossEn}
          onChange={(e) => setGlossEn(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm"
        />
      </label>
      <div className="mt-2 flex justify-end">
        <button
          type="submit"
          disabled={busy || (!changed && !sense.glossViIsMt)}
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {changed || !sense.glossViIsMt ? 'Save' : 'Mark reviewed'}
        </button>
      </div>
    </form>
  )
}

function FlagForm({ entry, onSaved, notify }: { entry: AdminEntry; onSaved: () => void; notify: Notify }) {
  const [reason, setReason] = useState(entry.flag?.reason ?? '')
  const [busy, setBusy] = useState(false)

  async function send(next: string | null) {
    if (busy) return
    setBusy(true)
    const outcome = await postAdmin('/api/admin/content', { action: 'flag', entryId: entry.id, reason: next })
    setBusy(false)
    if (!outcome.ok) return notify(outcome.message)
    if (next === null) setReason('')
    notify(next === null ? 'Flag removed.' : 'Entry flagged.', 'info')
    onSaved()
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); void send(reason.trim() || null) }}
      className="flex flex-wrap items-center gap-2"
    >
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={500}
        placeholder="Why it needs a look"
        aria-label="Flag reason"
        className="min-w-56 flex-1 rounded-lg border border-black/15 px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={busy || !reason.trim()}
        className="rounded-lg border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5 disabled:opacity-40"
      >
        {entry.flag ? 'Update flag' : 'Flag'}
      </button>
      {entry.flag && (
        <button
          type="button"
          onClick={() => void send(null)}
          disabled={busy}
          className="rounded-lg px-3 py-2 text-sm text-black/60 hover:bg-black/5 disabled:opacity-40"
        >
          Remove flag
        </button>
      )}
    </form>
  )
}

/**
 * One entry's senses, editable, and its flag. Each save goes through
 * app/api/admin/content/route.ts, which writes through `admin.update_sense` and flushes the
 * dictionary cache, so the entry page shows the new text on its next load.
 */
export function EntryEditor({ entry }: { entry: AdminEntry }) {
  const router = useRouter()
  const { notice, notify, dismiss } = useNotice()
  const refresh = () => router.refresh()

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-3">
        <h3 className="text-2xl font-semibold">{entry.headword}</h3>
        <span className="font-mono text-xs text-black/50">{entry.id}</span>
        <Link href={entryPath(entry.id)} prefetch={false} className="text-sm text-black/60 hover:underline">
          Open entry page
        </Link>
      </div>
      {entry.flag && (
        <p className="mt-1 text-sm text-amber-700">Flagged: {entry.flag.reason}</p>
      )}
      <div className="mt-3">
        <FlagForm key={entry.flag?.reason ?? ''} entry={entry} onSaved={refresh} notify={notify} />
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {entry.senses.length === 0 && <p className="text-sm text-black/60">No senses yet.</p>}
        {entry.senses.map((s) => (
          <SenseForm
            key={`${s.id}:${s.glossVi}:${s.glossEn}:${s.glossViIsMt}`}
            sense={s}
            onSaved={refresh}
            notify={notify}
          />
        ))}
      </div>
      <NoticeBar notice={notice} onDismiss={dismiss} />
    </div>
  )
}
