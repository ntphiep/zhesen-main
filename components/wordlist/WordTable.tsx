'use client'
import { Fragment } from 'react'
import { PosTag } from '@/components/ui/PosTag'
import { Ipa } from '@/components/ui/Ipa'
import { AudioButton, SourceLink } from '@/components/ui/AudioButton'
import { TagChips, WordRowActions } from '@/components/wordlist/WordRowActions'
import { WordDetail } from '@/components/wordlist/WordDetail'
import { formatWordDate, isDueAt, DUE_LABEL } from '@/lib/wordlist/format'
import { LANGUAGES } from '@/lib/languages'
import { STATUS_LABELS, type UserWord } from '@/lib/wordlist/types'
import type { ColumnDef, ColumnKey } from '@/lib/wordlist/columns'
import { useNarrowViewport } from '@/lib/hooks/useNarrowViewport'
import type { SortDir, SortKey } from '@/lib/hooks/useWordlistFilters'

/** Fixed, because measuring a width back after layout means setState in an effect, which
 *  `react-hooks/set-state-in-effect` refuses. Wider content is clipped. */
const PIN_WIDTH = 160
/** Measured on a 390px phone: the content box is 342px, so 44 + 3x160 leaves nothing to
 *  scroll and the third pinned column lands on top of the second. One narrower column
 *  holds the left edge there; the rest scroll with the table. */
const NARROW_PIN_WIDTH = 120
const NARROW_STICKY_LIMIT = 1
/** The checkbox column. Always first and always stuck to the left edge. */
const SELECT_WIDTH = 44

const LANG_NAME = new Map(LANGUAGES.map((l) => [l.code, l.name]))

interface Props {
  words: UserWord[]
  columns: ColumnDef[]
  pinned: ColumnKey[]
  sortKey: SortKey
  sortDir: SortDir
  onToggleSort: (key: SortKey) => void
  selected: ReadonlySet<string>
  allSelected: boolean
  onToggleSelectAll: () => void
  onToggleSelect: (id: string) => void
  expandedId: string | null
  onToggleDetail: (id: string) => void
  onEdit: (w: UserWord) => void
  onDelete: (id: string, headword: string) => void
}

export function WordTable({
  words, columns, pinned, sortKey, sortDir, onToggleSort,
  selected, allSelected, onToggleSelectAll, onToggleSelect,
  expandedId, onToggleDetail, onEdit, onDelete,
}: Props) {
  const narrow = useNarrowViewport()
  const pinWidth = narrow ? NARROW_PIN_WIDTH : PIN_WIDTH
  const stickyLimit = narrow ? NARROW_STICKY_LIMIT : columns.length

  // Pinned columns lead the list, so their offsets accumulate from the left edge in
  // order. Everything else scrolls.
  const offsets = new Map<ColumnKey, number>()
  let left = SELECT_WIDTH
  for (const c of columns) {
    if (!pinned.includes(c.key) || offsets.size >= stickyLimit) break
    offsets.set(c.key, left)
    left += pinWidth
  }

  function cellStyle(key: ColumnKey): React.CSSProperties | undefined {
    const offset = offsets.get(key)
    return offset === undefined
      ? undefined
      : { left: offset, width: pinWidth, minWidth: pinWidth, maxWidth: pinWidth }
  }

  // `bg-white` is not decoration on a pinned cell: without an opaque background the
  // scrolled columns show through it.
  const stickyClass = (key: ColumnKey) =>
    offsets.has(key) ? 'sticky z-10 bg-white' : ''

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="text-left text-xs font-medium uppercase tracking-wide text-black/45 [&_th]:border-b [&_th]:border-black/10">
            <th
              className="sticky left-0 z-20 bg-white px-3 py-2.5"
              style={{ width: SELECT_WIDTH, minWidth: SELECT_WIDTH }}
            >
              <input
                type="checkbox"
                checked={allSelected}
                // Without this a reader who ticked fifty of a hundred rows sees an empty
                // box, and the next click adds the other fifty instead of clearing theirs.
                ref={(el) => { if (el) el.indeterminate = !allSelected && selected.size > 0 }}
                onChange={onToggleSelectAll}
                aria-label="Chọn tất cả"
              />
            </th>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                aria-sort={sortKey === c.sortKey ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                className={`whitespace-nowrap px-3 py-2.5 ${c.align === 'right' ? 'text-right' : ''} ${stickyClass(c.key)} ${offsets.has(c.key) ? 'z-20 truncate' : ''}`}
                style={cellStyle(c.key)}
              >
                {c.sortKey ? (
                  <button
                    className="flex items-center gap-1 whitespace-nowrap uppercase tracking-wide hover:text-black"
                    onClick={() => onToggleSort(c.sortKey as SortKey)}
                  >
                    {c.label}
                    {sortKey === c.sortKey && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                  </button>
                ) : (
                  c.label
                )}
              </th>
            ))}
            <th className="whitespace-nowrap px-3 py-2.5 text-right">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {words.map((w) => (
            <Fragment key={w.id}>
              <tr className="hover:bg-black/2 [&_td]:border-b [&_td]:border-black/5">
                <td className="sticky left-0 z-10 bg-white px-3 py-2.5 align-top">
                  <input
                    type="checkbox"
                    checked={selected.has(w.id)}
                    onChange={() => onToggleSelect(w.id)}
                    aria-label={`Chọn từ ${w.headword}`}
                  />
                </td>
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-3 py-2.5 align-top ${offsets.has(c.key) ? 'truncate' : ''} ${stickyClass(c.key)}`}
                    style={cellStyle(c.key)}
                  >
                    <Cell word={w} column={c.key} />
                  </td>
                ))}
                <td className="px-3 py-2.5 align-top text-right">
                  <WordRowActions
                    word={w}
                    expanded={expandedId === w.id}
                    onToggleDetail={() => onToggleDetail(w.id)}
                    onEdit={() => onEdit(w)}
                    onDelete={() => onDelete(w.id, w.headword)}
                    className="justify-end"
                  />
                </td>
              </tr>
              {expandedId === w.id && (
                <tr className="bg-black/2">
                  <td colSpan={columns.length + 2} className="px-4 py-3">
                    <WordDetail word={w} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Cell({ word: w, column }: { word: UserWord; column: ColumnKey }) {
  switch (column) {
    case 'headword': return <span className="font-medium">{w.headword}</span>
    case 'lang': return <span className="text-black/50">{LANG_NAME.get(w.lang) ?? w.lang}</span>
    case 'ipa': return <Ipa value={w.ipa} lang={w.lang} className="text-black/50" />
    case 'pos': return <PosTag value={w.pos} className="text-black/50" />
    case 'meaningVi': return <>{w.meaningVi ?? ''}</>
    case 'meaningEn': return <span className="text-black/60">{w.meaningEn ?? ''}</span>
    case 'level': return <span className="text-black/50">{w.level ?? ''}</span>
    case 'status': return <span className="text-black/50">{STATUS_LABELS[w.status]}</span>
    case 'tags': return <TagChips tags={w.tags} />
    case 'example': return <span className="italic text-black/50">{w.example ?? ''}</span>
    case 'notes': return <span className="text-black/50">{w.notes ?? ''}</span>
    case 'createdAt': return <span className="whitespace-nowrap text-black/40">{formatWordDate(w.createdAt)}</span>
    case 'fsrsDueAt':
      return (
        <span className="whitespace-nowrap text-black/40">
          {isDueAt(w.fsrsDueAt) ? DUE_LABEL : formatWordDate(w.fsrsDueAt)}
        </span>
      )
    case 'fsrsLapses': return <span className="text-black/50">{w.fsrsLapses}</span>
    case 'audio':
      return (
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <AudioButton text={w.headword} lang={w.lang} audioUrl={w.audioUrl} />
          <SourceLink url={w.audioUrl} />
        </span>
      )
  }
}
