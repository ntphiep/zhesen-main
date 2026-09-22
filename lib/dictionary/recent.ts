import { z } from '@/lib/zod'
import { isLangCode, type LangCode } from '@/lib/languages'

const KEY = 'zhesen:recent-searches'

/** The key holds whatever a previous version, another tab or the user put there, so it
 *  must be parsed, not cast: a bad value throws from `recent.map(...)` during render. */
const storedList = z.string().array().catch([])

/** Prepend a query to the recent-searches list: trimmed, deduped case-insensitively
 * (newest casing wins), most-recent first, capped at `max`. Returns a new array. */
export function pushRecent(list: string[], query: string, max = 8): string[] {
  const q = query.trim()
  if (!q) return list
  const rest = list.filter((x) => x.toLowerCase() !== q.toLowerCase())
  return [q, ...rest].slice(0, max)
}

/** The stored list, or an empty one. Safe to call during the server-rendered pass. */
export function readRecent(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? storedList.parse(JSON.parse(raw)) : []
  } catch {
    return []
  }
}

/** Persist the list. Storage can be full or blocked, and neither is worth a crash. */
export function writeRecent(list: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* quota exceeded, or storage disabled */
  }
}

/** One frozen empty list, because `useSyncExternalStore` compares snapshots by identity. */
const NO_QUERIES: readonly string[] = Object.freeze([])

let queries: readonly string[] | null = null
const queryListeners = new Set<() => void>()

/**
 * The same list as an external store, which is what a component must read it through. The
 * row of recent queries is drawn whenever the box is empty, so it is on screen during
 * hydration, and a lazy `useState(readRecent)` renders storage on the first client pass
 * while the server rendered nothing: React #418.
 */
export const recentQueries = {
  subscribe(notify: () => void): () => void {
    queryListeners.add(notify)
    return () => { queryListeners.delete(notify) }
  },
  snapshot(): readonly string[] {
    return (queries ??= Object.freeze(readRecent()))
  },
  serverSnapshot(): readonly string[] {
    return NO_QUERIES
  },
  /** Prepend one query and persist. */
  push(query: string): void {
    const next = pushRecent([...recentQueries.snapshot()], query)
    queries = Object.freeze(next)
    writeRecent(next)
    for (const notify of [...queryListeners]) notify()
  },
  /** Forget the cached answer. For tests, which reuse the module. */
  reset(): void {
    queries = null
  },
}

/** One word actually opened, as opposed to one query typed. The strip under the boxes
 *  links straight back to the word page, so the id and the language travel with it. */
export interface RecentEntry {
  id: string
  headword: string
  lang: LangCode
  glossVi: string | null
}

const ENTRY_KEY = 'zhesen:recent-entries'
const ENTRY_MAX = 10

// Parsed loosely then filtered on `isLangCode`, the way `targetLangs.ts` handles the same
// problem: the key holds whatever an older version of the site wrote there.
const storedEntries = z.object({
  id: z.string(),
  headword: z.string(),
  lang: z.string(),
  glossVi: z.string().nullable().catch(null),
}).array().catch([])

/** Frozen and cached: `useSyncExternalStore` compares snapshots by identity, so reading
 *  storage on every call would re-render forever. */
const NO_ENTRIES: readonly RecentEntry[] = Object.freeze([])

let entries: readonly RecentEntry[] | null = null
const entryListeners = new Set<() => void>()

function readEntries(): readonly RecentEntry[] {
  if (typeof window === 'undefined') return NO_ENTRIES
  try {
    const raw = localStorage.getItem(ENTRY_KEY)
    if (!raw) return NO_ENTRIES
    const parsed = storedEntries.parse(JSON.parse(raw))
    return Object.freeze(parsed.filter((e): e is RecentEntry => isLangCode(e.lang)))
  } catch {
    return NO_ENTRIES
  }
}

export const recentEntries = {
  subscribe(notify: () => void): () => void {
    entryListeners.add(notify)
    return () => { entryListeners.delete(notify) }
  },
  snapshot(): readonly RecentEntry[] {
    return (entries ??= readEntries())
  },
  /** The server has no storage, so the first client render must agree with it and the
   *  stored list arrives on the render after hydration. */
  serverSnapshot(): readonly RecentEntry[] {
    return NO_ENTRIES
  },
  record(e: RecentEntry): void {
    const rest = recentEntries.snapshot().filter((x) => x.id !== e.id)
    entries = Object.freeze([e, ...rest].slice(0, ENTRY_MAX))
    try {
      localStorage.setItem(ENTRY_KEY, JSON.stringify(entries))
    } catch {
      /* quota exceeded, or storage disabled */
    }
    for (const notify of [...entryListeners]) notify()
  },
  /** Forget the cached answer. For tests, which reuse the module. */
  reset(): void {
    entries = null
  },
}
