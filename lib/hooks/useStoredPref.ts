'use client'
import { useCallback, useSyncExternalStore } from 'react'

/**
 * One preference per key, remembered per browser. `useSyncExternalStore`, not `useState`:
 * reading `localStorage` during render makes the server and the first client render
 * disagree. One key must have one `parse`, or two hooks overwrite each other's memo slot
 * every render and React loops.
 */

const listeners = new Set<() => void>()

/** What storage would hold if it worked. Safari's private mode and a browser with site
 *  data blocked throw on `setItem`, and without this the control would not move at all:
 *  nothing else holds the value, so the next read would return the old one. */
const fallback = new Map<string, string>()

export function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  // Another tab changing the same key must not leave this one disagreeing.
  window.addEventListener('storage', onChange)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onChange)
  }
}

function notifyAll(): void {
  for (const notify of listeners) notify()
}

export function readStored(key: string): string | null {
  try {
    const stored = window.localStorage.getItem(key)
    if (stored !== null) return stored
  } catch { /* blocked, so the only copy is the one held below */ }
  return fallback.get(key) ?? null
}

export function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
    fallback.delete(key)
  } catch {
    // The choice still has to take effect for this page, it just will not outlive it.
    fallback.set(key, value)
  }
  notifyAll()
}

export function useStoredPref<T>(
  key: string,
  parse: (raw: string | null) => T,
  serialize: (value: T) => string,
): [T, (value: T) => void] {
  // Both snapshots must return the same reference for an unchanged store, or
  // useSyncExternalStore loops. The raw string is the stable thing to memoise on.
  const getSnapshot = useCallback(() => cached(key, parse, readStored(key)), [key, parse])
  const getServerSnapshot = useCallback(() => cached(key, parse, null), [key, parse])
  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const set = useCallback((next: T) => writeStored(key, serialize(next)), [key, serialize])
  return [value, set]
}

const memo = new Map<string, { raw: string | null; value: unknown }>()

function cached<T>(key: string, parse: (raw: string | null) => T, raw: string | null): T {
  const hit = memo.get(key)
  if (hit && hit.raw === raw) return hit.value as T
  const value = parse(raw)
  memo.set(key, { raw, value })
  return value
}

/** Empty the memo. Module-level state outlives a render and leaks between test cases. */
export function resetStoredPrefCache(): void {
  memo.clear()
  fallback.clear()
}
