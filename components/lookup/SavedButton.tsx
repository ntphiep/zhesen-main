'use client'
import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { addWord, draftFromDictEntry, isWordSaved, WordAlreadyExistsError } from '@/lib/wordlist/store'
import { takePendingSave, WORDS_SAVED_EVENT } from '@/lib/wordlist/pendingSave'
import type { DictEntryDetail, DictEntryPreview } from '@/lib/dictionary/types'
import type { SaveContext, WordDraft } from '@/lib/wordlist/types'

type State = 'idle' | 'saving' | 'added' | 'exists' | 'error'

const PILL = 'rounded-full font-bold whitespace-nowrap transition-colors duration-150 ease-std'
/** A saved word reads as a settled chip rather than a faded button, which fell under 3:1. */
const PILL_STATE: Record<State, string> = {
  idle: 'bg-(--zs-btn) text-(--zs-btn-ink) hover:bg-(--zs-btn-hover)',
  error: 'bg-(--zs-btn) text-(--zs-btn-ink) hover:bg-(--zs-btn-hover)',
  saving: 'cursor-progress bg-(--zs-btn) text-(--zs-btn-ink)',
  added: 'bg-(--zs-chip) text-(--zs-ink)',
  exists: 'bg-(--zs-chip) text-(--zs-ink)',
}

/** The real save, mounted only once an account is in place. */
export function SavedButton({ entry, size = 'sm', tone, context, draft }: {
  entry: DictEntryPreview | DictEntryDetail
  size?: 'sm' | 'lg'
  tone?: 'pane'
  /** The sentence the word was tapped in, saved as its example. */
  context?: SaveContext | null
  /** A complete row that replaces the one built from the entry. */
  draft?: WordDraft
}) {
  const supabase = useMemo(() => createClient(), [])
  const [state, setState] = useState<State>('idle')

  const savePending = useEffectEvent(() => { void save() })

  // A save pressed before registering is finished here, once. Otherwise ask whether the
  // word is already saved instead of finding out by failing. A layout effect, so the
  // pending key is settled before the button can be seen or pressed.
  useLayoutEffect(() => {
    if (takePendingSave(entry.id)) {
      savePending()
      return
    }
    let live = true
    isWordSaved(supabase, entry.id).catch(() => false).then((saved) => {
      // Only an untouched button: a click may already be in flight, and its
      // outcome is newer than this answer.
      if (live && saved) setState((s) => (s === 'idle' ? 'exists' : s))
    })
    return () => { live = false }
  }, [supabase, entry.id])

  useEffect(() => {
    const onSaved = (e: Event) => {
      if (e instanceof CustomEvent && Array.isArray(e.detail) && e.detail.includes(entry.id)) {
        setState((s) => (s === 'idle' ? 'exists' : s))
      }
    }
    window.addEventListener(WORDS_SAVED_EVENT, onSaved)
    return () => window.removeEventListener(WORDS_SAVED_EVENT, onSaved)
  }, [entry.id])

  async function save() {
    setState('saving')
    try {
      await addWord(supabase, draft ?? draftFromDictEntry(entry, context))
      setState('added')
    } catch (e) {
      setState(e instanceof WordAlreadyExistsError ? 'exists' : 'error')
    }
  }

  const label = state === 'added' ? 'Đã thêm'
    : state === 'exists' ? 'Đã có trong sổ tay'
    : state === 'saving' ? 'Đang thêm…'
    : state === 'error' ? 'Lỗi, thử lại'
    : 'Thêm vào sổ tay'

  return (
    <button
      type="button"
      onClick={save}
      disabled={state === 'saving' || state === 'added' || state === 'exists'}
      className={tone === 'pane'
        ? 'h-10 rounded-full bg-(--pc) px-4 text-sm font-bold text-(--pb) disabled:opacity-60'
        : `${size === 'lg' ? 'h-11 px-5 text-sm' : 'h-9 px-4 text-[13px]'} ${PILL} ${PILL_STATE[state]}`}
    >
      {label}
    </button>
  )
}
