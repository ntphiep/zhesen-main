import { z } from '@/lib/zod'

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
