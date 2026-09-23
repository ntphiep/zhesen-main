'use client'
import { useSyncExternalStore } from 'react'
import { readStored, subscribe, writeStored } from './useStoredPref'

export type ViewMode = 'table' | 'card'

/** Width below which the eleven-column table cannot be read without scrolling sideways;
 *  matches Tailwind's `lg`. */
const TABLE_MIN_WIDTH = 1024

const KEY = 'wordlist_view'

/**
 * Table or cards, remembered per browser. Must go through `useSyncExternalStore`: reading
 * `localStorage` and `innerWidth` into `useState` makes the server send a table and the
 * first client render build cards, a hydration mismatch, and moving the read into an effect
 * trips `react-hooks/set-state-in-effect`. The store itself is `useStoredPref`'s, so a
 * write here reaches a `useStoredPref` reader and storage is guarded in one place.
 */
function getSnapshot(): ViewMode {
  const saved = readStored(KEY)
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

  return [view, (v: ViewMode) => writeStored(KEY, v)]
}
