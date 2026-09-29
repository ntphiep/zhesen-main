import type { DictEntryPreview } from '@/lib/dictionary/types'

/** Words the landing page's lookup has answered, newest first, for its review demo to
 *  practise. In memory only: the visitor has no notebook yet. */

export interface SeenWord {
  /** The Vietnamese query the word answered. */
  query: string
  entry: DictEntryPreview
}

const NONE: readonly SeenWord[] = Object.freeze([])
let words: readonly SeenWord[] = NONE
const listeners = new Set<() => void>()

export const seenWords = {
  subscribe(notify: () => void): () => void {
    listeners.add(notify)
    return () => { listeners.delete(notify) }
  },
  snapshot(): readonly SeenWord[] {
    return words
  },
  serverSnapshot(): readonly SeenWord[] {
    return NONE
  },
  /** Prepend the entries not seen before. */
  add(query: string, entries: DictEntryPreview[]): void {
    const fresh = entries.filter((e) => !words.some((w) => w.entry.id === e.id)).map((entry) => ({ query, entry }))
    if (!fresh.length) return
    words = Object.freeze([...fresh, ...words])
    for (const notify of [...listeners]) notify()
  },
}
