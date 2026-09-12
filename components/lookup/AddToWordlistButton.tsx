'use client'
import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { addWord, draftFromDictEntry, WordAlreadyExistsError } from '@/lib/wordlist/store'
import type { DictEntryDetail, DictEntryPreview } from '@/lib/dictionary/types'

type State = 'idle' | 'saving' | 'added' | 'exists' | 'error'

export function AddToWordlistButton({ entry }: { entry: DictEntryPreview | DictEntryDetail }) {
  const supabase = useMemo(() => createClient(), [])
  const [state, setState] = useState<State>('idle')

  async function onClick() {
    setState('saving')
    try {
      await addWord(supabase, draftFromDictEntry(entry))
      setState('added')
    } catch (e) {
      setState(e instanceof WordAlreadyExistsError ? 'exists' : 'error')
    }
  }

  const label = state === 'added' ? '✓ Đã thêm'
    : state === 'exists' ? '✓ Đã có trong sổ tay'
    : state === 'saving' ? 'Đang thêm...'
    : state === 'error' ? 'Lỗi, thử lại'
    : '+ Thêm vào sổ tay'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={state === 'saving' || state === 'added' || state === 'exists'}
      className="rounded-lg bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
    >
      {label}
    </button>
  )
}
