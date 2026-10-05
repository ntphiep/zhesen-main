'use client'
import { useEffect, useMemo, useState } from 'react'
import { accountKind } from '@/lib/auth/account'
import { loadSupabaseClient } from '@/lib/supabase/loadClient'
import { sentenceAt } from '@/lib/reader/sentence'
import { takePendingSave } from '@/lib/wordlist/pendingSave'
import type { ResolvedText } from '@/lib/dictionary/tappable'
import type { DictEntryPreview } from '@/lib/dictionary/types'
import type { NotebookState, SaveContext, WordNote } from '@/lib/wordlist/types'

/** The levels a passage offers to save: CEFR A1 to B2, and HSK 1 to 4 beside them. */
const STARTER_LEVELS = new Set(['A1', 'A2', 'B1', 'B2', 'HSK1', 'HSK2', 'HSK3', 'HSK4'])
/** Measured: the, to, and, of, a and is rank 1 to 8, and 80 of 1,504 English A1 entries rank
 *  within 100. A reader of a passage knows them, and a level on each was noise. */
const CORE_RANK = 100

const offersLevel = (e: DictEntryPreview) =>
  e.level !== null && STARTER_LEVELS.has(e.level) && !(e.frequencyRank != null && e.frequencyRank <= CORE_RANK)

interface Found {
  entry: DictEntryPreview
  context: SaveContext | null
}

/**
 * A signed-in reader's notebook over a resolved passage: each entry's state, read in one
 * query, and the save of every new word worth learning with the sentence it sits in. A
 * guest or an anonymous session gets nothing and the passage stays plain tappable text.
 */
export function usePassageNotebook(source: ResolvedText | null, translation: string | null) {
  const [states, setStates] = useState<{ text: string; map: ReadonlyMap<string, NotebookState> } | null>(null)
  const [saved, setSaved] = useState<{ text: string; count: number } | 'saving' | 'failed' | null>(null)

  // Each entry once, at its first sentence, in reading order.
  const found = useMemo(() => {
    const out = new Map<string, Found>()
    if (!source) return out
    const entries = new Map(source.entries)
    let at = 0
    for (const seg of source.segments) {
      const entry = seg.word ? entries.get(seg.text.toLowerCase()) : undefined
      if (entry && !out.has(entry.id)) {
        const sentence = sentenceAt(source.text, at, at + seg.text.length)
        out.set(entry.id, {
          entry,
          context: sentence ? { text: sentence, translationVi: sentence === source.text.trim() ? translation : null } : null,
        })
      }
      at += seg.text.length
    }
    return out
  }, [source, translation])

  useEffect(() => {
    if (!source || found.size === 0) return
    let live = true
    void (async () => {
      try {
        const supabase = (await loadSupabaseClient()).createClient()
        // The session from storage, no request: only a permanent account has a notebook to show.
        const { data } = await supabase.auth.getSession()
        if (accountKind(data.session?.user ?? null) !== 'permanent') return
        const [{ readNotebookStates }, { addWords, draftFromDictEntry }] = await Promise.all([
          import('@/lib/wordlist/stats'), import('@/lib/wordlist/store'),
        ])
        const map = await readNotebookStates(supabase, [...found.keys()])
        // A guest who pressed save on a word here registered and came back to `?q=`.
        const pending = [...found.values()].find((f) => !map.has(f.entry.id) && takePendingSave(f.entry.id))
        if (pending) {
          await addWords(supabase, [draftFromDictEntry(pending.entry, pending.context)])
          map.set(pending.entry.id, 'saved')
        }
        if (live) setStates({ text: source.text, map })
      } catch {
        // The passage stays plain tappable text.
      }
    })()
    return () => { live = false }
  }, [source, found])

  const map = states && source && states.text === source.text ? states.map : null
  const notes = useMemo(() => {
    if (!map) return undefined
    return new Map([...found].map(([id, f]): [string, WordNote] => {
      const state = map.get(id) ?? 'new'
      return [id, { state, level: state === 'new' && offersLevel(f.entry) ? f.entry.level : null }]
    }))
  }, [map, found])
  const offer = notes ? [...found.values()].filter((f) => notes.get(f.entry.id)?.level) : []

  async function saveOffer() {
    if (!map || !source || offer.length === 0) return
    setSaved('saving')
    try {
      const [{ createClient }, { addWords, draftFromDictEntry }] = await Promise.all([
        loadSupabaseClient(), import('@/lib/wordlist/store'),
      ])
      const rows = await addWords(createClient(), offer.map((f) => draftFromDictEntry(f.entry, f.context)))
      const next = new Map(map)
      for (const f of offer) next.set(f.entry.id, 'saved')
      setStates({ text: source.text, map: next })
      setSaved({ text: source.text, count: rows.length })
    } catch {
      setSaved('failed')
    }
  }

  return {
    notes,
    offer: offer.length,
    saveOffer,
    saving: saved === 'saving',
    failed: saved === 'failed',
    savedCount: saved && typeof saved === 'object' && saved.text === source?.text ? saved.count : null,
  }
}
