import type { UserWord } from './types'

/** The table's columns and the preferences held over them. Data rather than markup, so the
 *  header, the cells, the menu and the sort all read one list. */

export type ColumnKey =
  | 'headword' | 'lang' | 'ipa' | 'pos' | 'meaningVi' | 'meaningEn' | 'level'
  | 'status' | 'tags' | 'example' | 'notes' | 'createdAt' | 'fsrsDueAt' | 'fsrsLapses'
  | 'audio'

/** Every column except the audio button, which has nothing to order by. */
export type SortKey = Exclude<ColumnKey, 'audio'>

export interface ColumnDef {
  key: ColumnKey
  label: string
  /** null for a column with no meaningful order. */
  sortKey: SortKey | null
  /** Shown when the learner has expressed no preference. */
  defaultVisible: boolean
  /** The word itself. Hiding it would leave a row of attributes with no word. */
  required?: boolean
  align?: 'right'
}

export const COLUMNS: ColumnDef[] = [
  { key: 'headword', label: 'Từ', sortKey: 'headword', defaultVisible: true, required: true },
  { key: 'lang', label: 'Ngôn ngữ', sortKey: 'lang', defaultVisible: false },
  { key: 'ipa', label: 'IPA', sortKey: 'ipa', defaultVisible: true },
  { key: 'pos', label: 'Từ loại', sortKey: 'pos', defaultVisible: true },
  { key: 'meaningVi', label: 'Nghĩa', sortKey: 'meaningVi', defaultVisible: true },
  { key: 'meaningEn', label: 'Nghĩa tiếng Anh', sortKey: 'meaningEn', defaultVisible: false },
  { key: 'level', label: 'Trình độ', sortKey: 'level', defaultVisible: true },
  { key: 'status', label: 'Trạng thái', sortKey: 'status', defaultVisible: false },
  { key: 'tags', label: 'Thẻ', sortKey: 'tags', defaultVisible: true },
  { key: 'example', label: 'Ví dụ', sortKey: 'example', defaultVisible: false },
  { key: 'notes', label: 'Ghi chú', sortKey: 'notes', defaultVisible: false },
  { key: 'createdAt', label: 'Ngày thêm', sortKey: 'createdAt', defaultVisible: true },
  { key: 'fsrsDueAt', label: 'Lần ôn tới', sortKey: 'fsrsDueAt', defaultVisible: false },
  { key: 'fsrsLapses', label: 'Số lần sai', sortKey: 'fsrsLapses', defaultVisible: false },
  { key: 'audio', label: 'Audio', sortKey: null, defaultVisible: true },
]

const BY_KEY = new Map(COLUMNS.map((c) => [c.key, c]))

export function columnDef(key: ColumnKey): ColumnDef | undefined {
  return BY_KEY.get(key)
}

export interface ColumnPrefs {
  hidden: ColumnKey[]
  pinned: ColumnKey[]
}

export const DEFAULT_PREFS: ColumnPrefs = {
  hidden: COLUMNS.filter((c) => !c.defaultVisible).map((c) => c.key),
  pinned: ['headword'],
}

/** A pinned column is 160px wide and never scrolls, so three of them plus the checkbox
 *  already hold 524px. On a 390px phone a fourth would leave no width in which any
 *  unpinned column could be scrolled into view. */
export const MAX_PINNED = 3

/** Preferences read back from storage. Anything unrecognised is dropped rather than
 *  trusted: the value survives releases, and a renamed column must not blank the table. */
export function parseColumnPrefs(raw: string | null): ColumnPrefs {
  if (!raw) return DEFAULT_PREFS
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return DEFAULT_PREFS
    const { hidden, pinned, known } = parsed as { hidden?: unknown; pinned?: unknown; known?: unknown }
    // A column added after this value was written cannot be named in `hidden`, so it
    // would appear on its own. It takes its own default instead. A value from before
    // this field existed is read as knowing today's columns, which is what it did know.
    const seen = known === undefined ? new Set(COLUMNS.map((c) => c.key)) : new Set(keyList(known))
    const unseen = COLUMNS.filter((c) => !c.defaultVisible && !seen.has(c.key)).map((c) => c.key)
    return {
      // Truncated, not only refused at the button: a value written before the cap
      // existed can name more keys than the offsets allow for.
      hidden: [...new Set([...keyList(hidden, { skipRequired: true }), ...unseen])],
      pinned: keyList(pinned).slice(0, MAX_PINNED),
    }
  } catch {
    return DEFAULT_PREFS
  }
}

/** Written with the columns that existed at the time, so a later release can tell a
 *  column the reader hid from one they never saw. */
export function serializeColumnPrefs(prefs: ColumnPrefs): string {
  return JSON.stringify({ ...prefs, known: COLUMNS.map((c) => c.key) })
}

function keyList(value: unknown, options: { skipRequired?: boolean } = {}): ColumnKey[] {
  if (!Array.isArray(value)) return []
  const out: ColumnKey[] = []
  for (const v of value) {
    if (typeof v !== 'string') continue
    const def = BY_KEY.get(v as ColumnKey)
    if (!def || (options.skipRequired && def.required)) continue
    if (!out.includes(def.key)) out.push(def.key)
  }
  return out
}

/**
 * The columns to render, pinned ones first and each in the declared order. Pinned
 * columns lead because a sticky column can only hold the left edge of the table if
 * nothing unpinned sits before it.
 */
export function orderedColumns(prefs: ColumnPrefs): ColumnDef[] {
  const shown = COLUMNS.filter((c) => c.required || !prefs.hidden.includes(c.key))
  const pinned = shown.filter((c) => prefs.pinned.includes(c.key))
  const rest = shown.filter((c) => !prefs.pinned.includes(c.key))
  return [...pinned, ...rest]
}

export function isVisible(prefs: ColumnPrefs, key: ColumnKey): boolean {
  const def = BY_KEY.get(key)
  return !!def && (def.required === true || !prefs.hidden.includes(key))
}

export function toggleHidden(prefs: ColumnPrefs, key: ColumnKey): ColumnPrefs {
  const def = BY_KEY.get(key)
  if (!def || def.required) return prefs
  const hidden = prefs.hidden.includes(key)
    ? prefs.hidden.filter((k) => k !== key)
    : [...prefs.hidden, key]
  // A column nobody can see cannot stay pinned to the left edge.
  const pinned = hidden.includes(key) ? prefs.pinned.filter((k) => k !== key) : prefs.pinned
  return { hidden, pinned }
}

export function togglePinned(prefs: ColumnPrefs, key: ColumnKey): ColumnPrefs {
  if (!BY_KEY.has(key)) return prefs
  if (prefs.pinned.includes(key)) return { ...prefs, pinned: prefs.pinned.filter((k) => k !== key) }
  if (prefs.pinned.length >= MAX_PINNED) return prefs
  // Pinning implies showing: pinning a hidden column would change nothing on screen.
  return { hidden: prefs.hidden.filter((k) => k !== key), pinned: [...prefs.pinned, key] }
}

/** The value a column sorts and exports by. Kept next to the column list so a new
 *  column cannot be added without saying what it is ordered on. */
export function columnValue(w: UserWord, key: SortKey): string | number {
  switch (key) {
    // Sorted, because the stored order is whatever the import or the last edit left:
    // two words carrying the same tags have to land together.
    case 'tags': return [...w.tags].sort().join(', ')
    case 'fsrsLapses': return w.fsrsLapses
    case 'status': return STATUS_ORDER[w.status]
    default: return w[key] ?? ''
  }
}

/** New, then learning, then known: the order a learner moves through, not alphabetical. */
const STATUS_ORDER: Record<UserWord['status'], number> = { new: 0, learning: 1, known: 2 }
