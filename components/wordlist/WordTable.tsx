'use client'
import { Fragment, useRef, useState } from 'react'
import { PosTag } from '@/components/ui/PosTag'
import { Ipa } from '@/components/ui/Ipa'
import { AudioButton, SourceLink } from '@/components/ui/AudioButton'
import { TagChips, WordRowActions } from '@/components/wordlist/WordRowActions'
import { WordDetail } from '@/components/wordlist/WordDetail'
import { formatWordDate, isDueAt, DUE_LABEL } from '@/lib/wordlist/format'
import { LANGUAGES } from '@/lib/languages'
import { STATUS_LABELS, type UserWord } from '@/lib/wordlist/types'
import { clampWidth, MAX_COLUMN_WIDTH, MAX_PINNED_WIDTH, MIN_COLUMN_WIDTH, type ColumnDef, type ColumnKey } from '@/lib/wordlist/columns'
import { useNarrowViewport } from '@/lib/hooks/useNarrowViewport'
import type { SortDir, SortKey } from '@/lib/hooks/useWordlistFilters'
import s from './Wordlist.module.css'

/** A pinned column the reader never resized. Fixed, because measuring a width back after
 *  layout means setState in an effect, which `react-hooks/set-state-in-effect` refuses.
 *  Wider content is clipped. */
const PIN_WIDTH = 160
/** Measured on a 390px phone: the content box is 342px, so 44 + 3x160 leaves nothing to
 *  scroll and the third pinned column lands on top of the second. One narrower column
 *  holds the left edge there; the rest scroll with the table. */
const NARROW_PIN_WIDTH = 120
const NARROW_STICKY_LIMIT = 1
/** The checkbox column. Always first and always stuck to the left edge. */
const SELECT_WIDTH = 44
/** One arrow-key press on a resize handle. */
const RESIZE_STEP = 16

const LANG_NAME = new Map(LANGUAGES.map((l) => [l.code, l.name]))

interface Props {
  words: UserWord[]
  columns: ColumnDef[]
  pinned: ColumnKey[]
  /** Pixels for the columns the reader resized. */
  widths?: Partial<Record<ColumnKey, number>>
  /** null forgets the width. */
  onResizeColumn?: (key: ColumnKey, px: number | null) => void
  onMoveColumn?: (key: ColumnKey, target: ColumnKey) => void
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
  words, columns, pinned, widths = {}, onResizeColumn, onMoveColumn, sortKey, sortDir, onToggleSort,
  selected, allSelected, onToggleSelectAll, onToggleSelect,
  expandedId, onToggleDetail, onEdit, onDelete,
}: Props) {
  const narrow = useNarrowViewport()
  const pinWidth = narrow ? NARROW_PIN_WIDTH : PIN_WIDTH
  const stickyLimit = narrow ? NARROW_STICKY_LIMIT : columns.length

  // The width under the pointer while a handle is dragged. Written to storage only on
  // release, so a drag is not a storage write per pixel.
  const [live, setLive] = useState<{ key: ColumnKey; px: number } | null>(null)
  const [dragKey, setDragKey] = useState<ColumnKey | null>(null)
  const [overKey, setOverKey] = useState<ColumnKey | null>(null)
  // Set while a handle is held, so the header's own drag-to-reorder does not start.
  const resizing = useRef(false)

  // Pinned columns lead the list, so their offsets accumulate from the left edge in
  // order. Everything else scrolls.
  const offsets = new Map<ColumnKey, number>()
  const sticky = new Set<ColumnKey>()
  for (const c of columns) {
    if (!pinned.includes(c.key) || sticky.size >= stickyLimit) break
    sticky.add(c.key)
  }

  /** undefined leaves the column to size itself to its content. */
  function widthOf(key: ColumnKey): number | undefined {
    // A phone has room for one narrow pinned column and no more.
    if (narrow && sticky.has(key)) return NARROW_PIN_WIDTH
    const px = live?.key === key ? live.px : widths[key]
    if (!sticky.has(key)) return px
    return px === undefined ? pinWidth : Math.min(px, MAX_PINNED_WIDTH)
  }

  let left = SELECT_WIDTH
  for (const key of sticky) {
    offsets.set(key, left)
    left += widthOf(key) ?? pinWidth
  }

  function cellStyle(key: ColumnKey): React.CSSProperties | undefined {
    const width = widthOf(key)
    const offset = offsets.get(key)
    if (width === undefined) return undefined
    return { left: offset, width, minWidth: width, maxWidth: width }
  }

  const samePinGroup = (a: ColumnKey, b: ColumnKey) => pinned.includes(a) === pinned.includes(b)

  // The sticky column on a phone is always NARROW_PIN_WIDTH, so a width set there would
  // change nothing on screen and overwrite the one chosen on a wider screen.
  const resizable = (key: ColumnKey) => onResizeColumn !== undefined && !(narrow && sticky.has(key))

  function startResize(e: React.PointerEvent<HTMLElement>, key: ColumnKey) {
    const th = e.currentTarget.parentElement
    if (!th || !onResizeColumn || e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    resizing.current = true
    const startX = e.clientX
    const startWidth = th.getBoundingClientRect().width
    // null until the pointer moves: a plain click must not freeze the measured width.
    let px: number | null = null
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)
    function onMove(ev: PointerEvent) {
      px = clampWidth(startWidth + ev.clientX - startX)
      setLive({ key, px })
    }
    function onUp() {
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
      handle.removeEventListener('pointercancel', onUp)
      resizing.current = false
      setLive(null)
      if (px !== null) onResizeColumn?.(key, px)
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
    handle.addEventListener('pointercancel', onUp)
  }

  function resizeByKey(e: React.KeyboardEvent<HTMLElement>, key: ColumnKey) {
    if (!onResizeColumn) return
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); onResizeColumn(key, null); return }
    const step = e.key === 'ArrowLeft' ? -RESIZE_STEP : e.key === 'ArrowRight' ? RESIZE_STEP : 0
    if (step === 0) return
    e.preventDefault()
    const current = widthOf(key) ?? e.currentTarget.parentElement?.getBoundingClientRect().width ?? 0
    onResizeColumn(key, current + step)
  }

  // `bg-(--zs-bg)` is not decoration on a pinned cell: without an opaque background the
  // scrolled columns show through it.
  const stickyClass = (key: ColumnKey) =>
    offsets.has(key) ? 'sticky z-10 bg-(--zs-bg)' : ''

  return (
    <div className={`${s.sheet} overflow-x-auto`}>
      <table className="w-full border-separate border-spacing-0">
        <thead>
          <tr className="text-left uppercase">
            <th
              className="sticky left-0 z-20 px-3 py-2.5"
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
                className={`${offsets.has(c.key) ? '' : 'relative'} whitespace-nowrap px-3 py-2.5 ${c.align === 'right' ? 'text-right' : ''} ${stickyClass(c.key)} ${offsets.has(c.key) ? 'z-20' : ''} ${widthOf(c.key) !== undefined ? 'truncate' : ''} ${dragKey === c.key ? 'opacity-40' : ''} ${overKey === c.key ? s.over : ''}`}
                style={cellStyle(c.key)}
                draggable={onMoveColumn !== undefined}
                onDragStart={(e) => {
                  if (resizing.current) { e.preventDefault(); return }
                  e.dataTransfer.effectAllowed = 'move'
                  // Firefox starts no drag without data. Not text/plain, or a header dropped
                  // on the filter box would type its key into it.
                  e.dataTransfer.setData('application/x-wordlist-column', c.key)
                  setDragKey(c.key)
                }}
                onDragOver={(e) => {
                  if (!dragKey || dragKey === c.key || !samePinGroup(dragKey, c.key)) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  if (overKey !== c.key) setOverKey(c.key)
                }}
                onDragLeave={() => { if (overKey === c.key) setOverKey(null) }}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragKey && dragKey !== c.key && samePinGroup(dragKey, c.key)) onMoveColumn?.(dragKey, c.key)
                  setDragKey(null)
                  setOverKey(null)
                }}
                onDragEnd={() => { setDragKey(null); setOverKey(null) }}
              >
                {c.sortKey ? (
                  <button
                    className="flex items-center gap-1 whitespace-nowrap uppercase"
                    onClick={() => onToggleSort(c.sortKey as SortKey)}
                  >
                    {c.label}
                    {sortKey === c.sortKey && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                  </button>
                ) : (
                  c.label
                )}
                {resizable(c.key) && onResizeColumn && (
                  <span
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Đổi độ rộng cột ${c.label}`}
                    aria-valuenow={widthOf(c.key)}
                    aria-valuetext={widthOf(c.key) === undefined ? 'Tự động' : `${widthOf(c.key)}px`}
                    aria-valuemin={MIN_COLUMN_WIDTH}
                    aria-valuemax={sticky.has(c.key) ? MAX_PINNED_WIDTH : MAX_COLUMN_WIDTH}
                    tabIndex={0}
                    title="Kéo để đổi độ rộng. Nhấp đúp hoặc bấm Delete để đặt lại."
                    className={`${s.grip} absolute inset-y-0 right-0 w-2 cursor-col-resize touch-none select-none`}
                    onPointerDown={(e) => startResize(e, c.key)}
                    onDoubleClick={() => onResizeColumn(c.key, null)}
                    onKeyDown={(e) => resizeByKey(e, c.key)}
                  />
                )}
              </th>
            ))}
            <th className="whitespace-nowrap px-3 py-2.5 text-right">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {words.map((w) => (
            <Fragment key={w.id}>
              <tr className={s.row} data-on={selected.has(w.id) || undefined}>
                <td className="sticky left-0 z-10 bg-(--zs-bg) px-3 py-2.5">
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
                    className={`px-3 py-2.5 ${widthOf(c.key) !== undefined ? 'truncate' : ''} ${stickyClass(c.key)}`}
                    style={cellStyle(c.key)}
                  >
                    <Cell word={w} column={c.key} />
                  </td>
                ))}
                <td className="px-3 py-2.5 text-right">
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
                <tr className={s.detail}>
                  <td colSpan={columns.length + 2} className="px-4 py-4">
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
    case 'headword': return <span className={s.hw} data-l={w.lang} lang={w.lang}>{w.headword}</span>
    case 'lang': return <span className={s.lang} data-l={w.lang}>{LANG_NAME.get(w.lang) ?? w.lang}</span>
    case 'ipa': return <Ipa value={w.ipa} lang={w.lang} className={s.pron} />
    case 'pos': return <PosTag value={w.pos} className={s.pron} />
    case 'meaningVi': return <span className="font-semibold">{w.meaningVi ?? ''}</span>
    case 'meaningEn': return <span className={s.pron}>{w.meaningEn ?? ''}</span>
    case 'level': return w.level ? <span className={s.level}>{w.level}</span> : null
    case 'status': return <span className={s.status} data-s={w.status}>{STATUS_LABELS[w.status]}</span>
    case 'tags': return <TagChips tags={w.tags} />
    case 'example': return <span className={`italic ${s.pron}`}>{w.example ?? ''}</span>
    case 'notes': return <span className={s.pron}>{w.notes ?? ''}</span>
    case 'createdAt': return <span className={`whitespace-nowrap ${s.pron}`}>{formatWordDate(w.createdAt)}</span>
    case 'fsrsDueAt':
      return (
        <span className={`whitespace-nowrap ${s.pron}`}>
          {isDueAt(w.fsrsDueAt) ? DUE_LABEL : formatWordDate(w.fsrsDueAt)}
        </span>
      )
    case 'fsrsLapses': return <span className={s.pron}>{w.fsrsLapses}</span>
    case 'audio':
      return (
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <AudioButton text={w.headword} lang={w.lang} audioUrl={w.audioUrl} />
          <SourceLink url={w.audioUrl} />
        </span>
      )
  }
}
