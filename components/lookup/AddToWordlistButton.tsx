'use client'
import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { addWord, draftFromDictEntry } from '@/lib/wordlist/store'
import type { DictEntryPreview } from '@/lib/dictionary/types'

type State = 'idle' | 'saving' | 'added' | 'error'

export function AddToWordlistButton({ entry }: { entry: DictEntryPreview }) {
  const supabase = useMemo(() => createClient(), [])
  const [state, setState] = useState<State>('idle')

  async function onClick() {
    setState('saving')
    try {
      await addWord(supabase, draftFromDictEntry(entry))
      setState('added')
    } catch {
      setState('error')
    }
  }

  const label = state === 'added' ? '✓ Đã thêm'
    : state === 'saving' ? 'Đang thêm...'
    : state === 'error' ? 'Lỗi, thử lại'
    : '+ Thêm vào sổ tay'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={state === 'saving' || state === 'added'}
      className="rounded-lg bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
    >
      {label}
    </button>
  )
}
