'use client'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { addWord, draftFromDictEntry, isWordSaved, WordAlreadyExistsError } from '@/lib/wordlist/store'
import { entryPath } from '@/lib/dictionary/entryId'
import { LinkPending } from '@/components/ui/LinkPending'
import { signInHref, useAccount } from '@/lib/hooks/useAccount'
import type { DictEntryDetail, DictEntryPreview } from '@/lib/dictionary/types'

type State = 'idle' | 'saving' | 'added' | 'exists' | 'error'

/**
 * Save one dictionary entry to the notebook. The notebook belongs to an
 * account, so without one this button is an invitation to sign in, pointing at
 * the page the visitor came from: a word looked up is worth saving, and the
 * sign-in must not cost them where they were reading it.
 */
export function AddToWordlistButton({ entry }: { entry: DictEntryPreview | DictEntryDetail }) {
  const { kind } = useAccount()

  if (kind === null) return null
  if (kind !== 'permanent') {
    return (
      <Link
        href={`${signInHref(kind)}?next=${encodeURIComponent(entryPath(entry.id))}`}
        prefetch={false}
        className="rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium text-black/70 hover:bg-black/5"
      >
        Đăng nhập để lưu
        <LinkPending />
      </Link>
    )
  }
  return <SavedButton entry={entry} />
}

/** The real save, mounted only once an account is in place. */
function SavedButton({ entry }: { entry: DictEntryPreview | DictEntryDetail }) {
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
      className="rounded-lg bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
    >
      {label}
    </button>
  )
}
