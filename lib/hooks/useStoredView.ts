'use client'
import { useSyncExternalStore } from 'react'

export type ViewMode = 'table' | 'card'

/** Width below which the eleven-column table cannot be read without scrolling sideways;
 *  matches Tailwind's `lg`. */
const TABLE_MIN_WIDTH = 1024

const KEY = 'wordlist_view'

/**
 * Table or cards, remembered per browser. Must go through `useSyncExternalStore`: reading
 * `localStorage` and `innerWidth` into `useState` makes the server send a table and the
 * first client render build cards, a hydration mismatch, and moving the read into an effect
 * trips `react-hooks/set-state-in-effect`. Storage can be full or blocked, so every access
 * is guarded; a lost view preference costs one click.
 */
const listeners = new Set<() => void>()

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  // Another tab changing the preference should not leave this one disagreeing.
  window.addEventListener('storage', onChange)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onChange)
  }
}

function readStored(): string | null {
  try { return window.localStorage.getItem(KEY) } catch { return null }
}

function getSnapshot(): ViewMode {
  const saved = readStored()
  if (saved === 'card' || saved === 'table') return saved
  // Without a stored choice, pick by what fits: on a phone the table clips its last
  // columns off the screen.
  return window.innerWidth < TABLE_MIN_WIDTH ? 'card' : 'table'
}

/** What the server renders, and therefore what the first client render must render too.
 *  The real preference arrives immediately afterwards. */
const getServerSnapshot = (): ViewMode => 'table'

export function useStoredView(): [ViewMode, (v: ViewMode) => void] {
  const view = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  function setView(v: ViewMode) {
    try { window.localStorage.setItem(KEY, v) } catch { /* see readStored */ }
    for (const notify of listeners) notify()
  }

  return [view, setView]
}
