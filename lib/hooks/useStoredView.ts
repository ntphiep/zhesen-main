'use client'
import { useSyncExternalStore } from 'react'

export type ViewMode = 'table' | 'card'

/** Width below which the eleven-column table cannot be read without scrolling
 * sideways; matches Tailwind's `lg`. */
const TABLE_MIN_WIDTH = 1024

const KEY = 'wordlist_view'

/**
 * Table or cards, remembered per browser.
 *
 * This is a value the server cannot know and the browser can, which is exactly
 * what `useSyncExternalStore` is for. Reading `localStorage` and `innerWidth`
 * straight into `useState` made the server send a table and the browser's first
 * render build a card grid: two different trees, so React discarded the server
 * HTML and rebuilt all 400 rows with a hydration error. Moving the read into an
 * effect fixes the mismatch but trips `react-hooks/set-state-in-effect`, and
 * AGENTS.md rules out silencing a lint rule to get past it.
 *
 * `getServerSnapshot` returns 'table' -- the same thing the first client render
 * returns -- so hydration matches, and React then re-reads the real value.
 *
 * Storage can be full or blocked, and neither is worth a crash: same guard as
 * lib/dictionary/recent.ts. A lost view preference costs one click.
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
  // Without a stored choice, pick by what fits: on a phone the table clipped its
  // last columns off the screen, and cards say the same thing in one column.
  return window.innerWidth < TABLE_MIN_WIDTH ? 'card' : 'table'
}

/** What the server renders, and therefore what the first client render must
 *  render too. The real preference arrives immediately afterwards. */
const getServerSnapshot = (): ViewMode => 'table'

export function useStoredView(): [ViewMode, (v: ViewMode) => void] {
  const view = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  function setView(v: ViewMode) {
    try { window.localStorage.setItem(KEY, v) } catch { /* see readStored */ }
    for (const notify of listeners) notify()
  }

  return [view, setView]
}
