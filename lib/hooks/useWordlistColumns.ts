'use client'
import { useCallback, useMemo } from 'react'
import {
  DEFAULT_PREFS, orderedColumns, parseColumnPrefs, serializeColumnPrefs, toggleHidden,
  togglePinned, type ColumnKey, type ColumnPrefs,
} from '@/lib/wordlist/columns'
import { useStoredPref } from './useStoredPref'

const KEY = 'wordlist_columns'

/** Which columns the table shows and which stay against the left edge while it scrolls
 *  sideways, remembered per browser. */
export function useWordlistColumns() {
  const [prefs, setPrefs] = useStoredPref<ColumnPrefs>(KEY, parseColumnPrefs, serializeColumnPrefs)
  const columns = useMemo(() => orderedColumns(prefs), [prefs])
  const pinnedCount = useMemo(
    () => columns.filter((c) => prefs.pinned.includes(c.key)).length,
    [columns, prefs.pinned],
  )

  const toggleColumn = useCallback((key: ColumnKey) => setPrefs(toggleHidden(prefs, key)), [prefs, setPrefs])
  const togglePin = useCallback((key: ColumnKey) => setPrefs(togglePinned(prefs, key)), [prefs, setPrefs])
  const reset = useCallback(() => setPrefs(DEFAULT_PREFS), [setPrefs])

  return { prefs, columns, pinnedCount, toggleColumn, togglePin, reset }
}
