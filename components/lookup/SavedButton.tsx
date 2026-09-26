'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { addWord, draftFromDictEntry, isWordSaved, WordAlreadyExistsError } from '@/lib/wordlist/store'
import type { DictEntryDetail, DictEntryPreview } from '@/lib/dictionary/types'

type State = 'idle' | 'saving' | 'added' | 'exists' | 'error'

/** The real save, mounted only once an account is in place. */
export function SavedButton({ entry, size = 'sm' }: { entry: DictEntryPreview | DictEntryDetail; size?: 'sm' | 'lg' }) {
  const supabase = useMemo(() => createClient(), [])
  const [state, setState] = useState<State>('idle')

  // Ask whether the word is already saved instead of finding out by failing.
  useEffect(() => {
    let live = true
    isWordSaved(supabase, entry.id).catch(() => false).then((saved) => {
      // Only an untouched button: a click may already be in flight, and its
      // outcome is newer than this answer.
      if (live && saved) setState((s) => (s === 'idle' ? 'exists' : s))
    })
    return () => { live = false }
  }, [supabase, entry.id])

  async function onClick() {
    setState('saving')
    try {
      await addWord(supabase, draftFromDictEntry(entry))
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
      onClick={onClick}
      disabled={state === 'saving' || state === 'added' || state === 'exists'}
      className={size === 'lg'
        ? 'h-11 rounded-[10px] bg-black px-[18px] text-sm font-semibold text-white disabled:opacity-50'
        : 'rounded-lg bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50'}
    >
      {label}
    </button>
  )
}
