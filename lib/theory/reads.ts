/**
 * The theory pages this browser opened, remembered per browser.
 *
 * An external store for the same reasons as `wordLayout` (lib/dictionary/wordLayout.ts):
 * reading storage during render is React #418 once the stored value differs from the
 * server's pass, and the effect form is forbidden by `react-hooks/set-state-in-effect`.
 * Theory pages are cached for everyone, so nothing here reads a cookie or the session: the
 * server draws every page unread and the read state arrives on the render after hydration.
 */
import { z } from '@/lib/zod'

const KEY = 'zhesen:theory-read'
/** Every theory page of all three languages is under 300. */
const MAX = 400

/** Path to when it was last opened. Map order is oldest first. */
export type TheoryReads = ReadonlyMap<string, number>

/** One frozen empty map, because `useSyncExternalStore` compares snapshots by identity. */
const NONE: TheoryReads = new Map()

// The key holds whatever an older version, another tab or the reader put there.
const stored = z.array(z.tuple([z.string(), z.number()])).catch([])

let current: TheoryReads | null = null
const listeners = new Set<() => void>()

function read(): TheoryReads {
  if (typeof window === 'undefined') return NONE
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? new Map(stored.parse(JSON.parse(raw))) : NONE
  } catch {
    return NONE
  }
}

/** A page with reading on it: under a language, not the hub of one. */
export function isTheoryPage(path: string): boolean {
  return /^\/theory\/[a-z]{2}\/[^/]/.test(path)
}

export const theoryReads = {
  subscribe(notify: () => void): () => void {
    listeners.add(notify)
    return () => { listeners.delete(notify) }
  },
  snapshot(): TheoryReads {
    return (current ??= read())
  },
  /** Answers the first client render too, so it agrees with the HTML. */
  serverSnapshot(): TheoryReads {
    return NONE
  },
  /** Mark a page opened now, keeping the newest `MAX`. */
  record(path: string, at: number): void {
    if (!isTheoryPage(path)) return
    const next = new Map(theoryReads.snapshot())
    next.delete(path)
    next.set(path, at)
    for (const old of next.keys()) {
      if (next.size <= MAX) break
      next.delete(old)
    }
    current = next
    try {
      localStorage.setItem(KEY, JSON.stringify([...next]))
    } catch {
      /* quota exceeded, or storage disabled */
    }
    for (const notify of [...listeners]) notify()
  },
  /** Forget the cached answer. For tests, which reuse the module. */
  reset(): void {
    current = null
  },
}
