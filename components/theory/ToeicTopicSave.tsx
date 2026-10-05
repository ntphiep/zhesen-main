'use client'
import { useState } from 'react'
import Link from 'next/link'
import { LinkPending } from '@/components/ui/LinkPending'
import { useAccount } from '@/lib/hooks/useAccount'
import { loadSupabaseClient } from '@/lib/supabase/loadClient'
import { announceSaved } from '@/lib/wordlist/pendingSave'
import { ArrowRight, Warn } from './Glyphs'
import s from './Theory.module.css'
import type { LangCode } from '@/lib/languages'
import type { WordDraft } from '@/lib/wordlist/types'

type SaveState = { kind: 'idle' } | { kind: 'busy' } | { kind: 'done'; added: number } | { kind: 'error' }

/** Save every word of a topic not yet in the notebook, with its test meaning, its sentence
 *  and the TOEIC tag. The notebook belongs to an account, so without one the same label
 *  leads to /register and back to the topic. */
export function ToeicTopicSave({ lang, path, drafts }: {
  lang: LangCode
  path: string
  /** Built by `toeicDraft`, as each word's own save is. */
  drafts: WordDraft[]
}) {
  const { kind } = useAccount()
  const [state, setState] = useState<SaveState>({ kind: 'idle' })

  async function save() {
    setState({ kind: 'busy' })
    try {
      // Imported on the click, as in `LevelWordList`: reading the topic needs neither.
      const [{ createClient }, { addWords, listSavedEntryIds }] = await Promise.all([
        loadSupabaseClient(),
        import('@/lib/wordlist/store'),
      ])
      const supabase = createClient()
      const saved = await listSavedEntryIds(supabase, lang)
      // What `addWords` inserted, not what it was asked to: a save in another tab is invisible above.
      const added = await addWords(supabase, drafts.filter((d) => !d.entryId || !saved.has(d.entryId)))
      setState({ kind: 'done', added: added.length })
      announceSaved(drafts.flatMap((d) => (d.entryId ? [d.entryId] : [])))
    } catch {
      setState({ kind: 'error' })
    }
  }

  if (kind === null) return null
  if (kind !== 'permanent') {
    return (
      <Link href={`/register?next=${encodeURIComponent(path)}`} prefetch={false} className={s.ghost}>
        Lưu cả chủ đề vào sổ tay
        <LinkPending />
      </Link>
    )
  }

  const label = state.kind === 'busy' ? 'Đang lưu…'
    : state.kind === 'done' ? (state.added > 0 ? `Đã lưu ${state.added} từ` : 'Cả chủ đề đã có trong sổ tay')
    : state.kind === 'error' ? 'Chưa lưu được. Thử lại.'
    : 'Lưu cả chủ đề vào sổ tay'

  return (
    <div className="flex flex-wrap items-center gap-3" aria-live="polite">
      <button
        type="button"
        onClick={save}
        disabled={state.kind === 'busy' || state.kind === 'done'}
        className={s.btn}
      >
        {state.kind === 'error' && <Warn />}
        {label}
      </button>
      {state.kind === 'done' && (
        <Link href="/practice" prefetch={false} className={s.ghost}>
          Luyện tập <ArrowRight />
          <LinkPending />
        </Link>
      )}
    </div>
  )
}
