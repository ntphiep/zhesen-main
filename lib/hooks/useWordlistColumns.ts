'use client'
import { useCallback, useMemo } from 'react'
import {
  DEFAULT_LAYOUT, DEFAULT_PREFS, menuColumns, moveColumn, orderedColumns, parseColumnLayout,
  parseColumnPrefs, serializeColumnLayout, serializeColumnPrefs, setColumnWidth, toggleHidden,
  togglePinned, type ColumnKey, type ColumnLayout, type ColumnPrefs,
} from '@/lib/wordlist/columns'
import { useStoredPref } from './useStoredPref'

const KEY = 'wordlist_columns'
const LAYOUT_KEY = 'wordlist_column_layout'

/** Which columns the table shows, which stay against the left edge while it scrolls
 *  sideways, and their order and widths, remembered per browser. */
export function useWordlistColumns() {
  const [prefs, setPrefs] = useStoredPref<ColumnPrefs>(KEY, parseColumnPrefs, serializeColumnPrefs)
  const [layout, setLayout] = useStoredPref<ColumnLayout>(LAYOUT_KEY, parseColumnLayout, serializeColumnLayout)
  const columns = useMemo(() => orderedColumns(prefs, layout), [prefs, layout])
  const allColumns = useMemo(() => menuColumns(prefs, layout), [prefs, layout])
  const pinnedCount = useMemo(
    () => columns.filter((c) => prefs.pinned.includes(c.key)).length,
    [columns, prefs.pinned],
  )

  const toggleColumn = useCallback((key: ColumnKey) => setPrefs(toggleHidden(prefs, key)), [prefs, setPrefs])
  const togglePin = useCallback((key: ColumnKey) => setPrefs(togglePinned(prefs, key)), [prefs, setPrefs])
  const move = useCallback(
    (key: ColumnKey, target: ColumnKey) => setLayout(moveColumn(layout, key, target)),
    [layout, setLayout],
  )
  const resize = useCallback(
    (key: ColumnKey, px: number | null) => setLayout(setColumnWidth(layout, key, px)),
    [layout, setLayout],
  )
  const reset = useCallback(() => {
    setPrefs(DEFAULT_PREFS)
    setLayout(DEFAULT_LAYOUT)
  }, [setPrefs, setLayout])

  return { prefs, layout, columns, allColumns, pinnedCount, toggleColumn, togglePin, move, resize, reset }
}
