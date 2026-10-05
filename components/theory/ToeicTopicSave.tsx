'use client'
import { useState } from 'react'
import Link from 'next/link'
import { LinkPending } from '@/components/ui/LinkPending'
import { useAccount } from '@/lib/hooks/useAccount'
import { loadSupabaseClient } from '@/lib/supabase/loadClient'
import { announceSaved } from '@/lib/wordlist/pendingSave'
import { ArrowRight, Warn } from './Glyphs'
import s from './Theory.module.css'
import type { DictEntryPreview } from '@/lib/dictionary/types'
import type { LangCode } from '@/lib/languages'
import type { ToeicExample } from '@/lib/theory/toeicStudy'

/** The tag every word saved from a TOEIC topic carries, which `/practice?tag=` filters on. */
export const TOEIC_TAG = 'toeic'

type SaveState = { kind: 'idle' } | { kind: 'busy' } | { kind: 'done'; added: number } | { kind: 'error' }

/** Save every word of a topic not yet in the notebook, with its test meaning, its sentence
 *  and the TOEIC tag. The notebook belongs to an account, so without one the same label
 *  leads to /register and back to the topic. */
export function ToeicTopicSave({ lang, path, words }: {
  lang: LangCode
  path: string
  words: { entry: DictEntryPreview; example: ToeicExample | null }[]
}) {
  const { kind } = useAccount()
  const [state, setState] = useState<SaveState>({ kind: 'idle' })

  async function save() {
    setState({ kind: 'busy' })
    try {
      // Imported on the click, as in `LevelWordList`: reading the topic needs neither.
      const [{ createClient }, { addWords, draftFromDictEntry, listSavedEntryIds }] = await Promise.all([
        loadSupabaseClient(),
        import('@/lib/wordlist/store'),
      ])
      const supabase = createClient()
      const saved = await listSavedEntryIds(supabase, lang)
      const drafts = words.filter((w) => !saved.has(w.entry.id)).map((w) => ({
        ...draftFromDictEntry(w.entry),
        example: w.example?.text ?? null,
        exampleTranslation: w.example?.vi ?? null,
        tags: [TOEIC_TAG],
      }))
      // What `addWords` inserted, not what it was asked to: a save in another tab is invisible above.
      const added = await addWords(supabase, drafts)
      setState({ kind: 'done', added: added.length })
      announceSaved(words.map((w) => w.entry.id))
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
        <Link href={`/practice?tag=${TOEIC_TAG}`} prefetch={false} className={s.ghost}>
          Luyện tập <ArrowRight />
          <LinkPending />
        </Link>
      )}
    </div>
  )
}
