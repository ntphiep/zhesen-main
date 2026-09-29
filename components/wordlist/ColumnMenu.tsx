'use client'
import { useEffect, useRef, useState } from 'react'
import { COLUMNS, MAX_PINNED, type ColumnDef, type ColumnKey, type ColumnPrefs } from '@/lib/wordlist/columns'
import { useNarrowViewport } from '@/lib/hooks/useNarrowViewport'
import s from './Wordlist.module.css'

interface Props {
  prefs: ColumnPrefs
  /** Every column, hidden ones included, in the table's order. */
  columns: ColumnDef[]
  onToggleColumn: (key: ColumnKey) => void
  onTogglePin: (key: ColumnKey) => void
  onMove: (key: ColumnKey, target: ColumnKey) => void
  onReset: () => void
}

/** Which columns the table shows, in what order, and which stay against the left edge
 *  while the rest scroll sideways. The arrows are the way to reorder on a touch screen,
 *  where dragging a header does nothing. */
export function ColumnMenu({ prefs, columns, onToggleColumn, onTogglePin, onMove, onReset }: Props) {
  const [open, setOpen] = useState(false)
  const hiddenCount = prefs.hidden.length
  const pinsLeft = MAX_PINNED - prefs.pinned.length
  const root = useRef<HTMLDivElement>(null)
  // A phone holds one column at the left edge whatever is pinned, so offering the
  // control there would spend the reader's three slots on nothing.
  const narrow = useNarrowViewport()

  const isShown = (c: ColumnDef) => c.required === true || !prefs.hidden.includes(c.key)
  // A column only trades places with a shown neighbour in its own group: pinned columns
  // always lead, so a move across that line would change nothing on screen.
  function neighbour(c: ColumnDef, step: -1 | 1): ColumnKey | null {
    const pinned = prefs.pinned.includes(c.key)
    const peers = columns.filter((d) => isShown(d) && prefs.pinned.includes(d.key) === pinned)
    return peers[peers.indexOf(c) + step]?.key ?? null
  }

  // A dropdown that only closes by pressing its own button traps the reader on a phone,
  // where it covers the table it is meant to configure.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    function onDown(e: MouseEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  return (
    <div className="relative" ref={root}>
      <button
        className={s.ghost}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        Cột{hiddenCount > 0 ? ` (${COLUMNS.length - hiddenCount})` : ''} ▾
      </button>
      {open && (
        <div
          role="menu"
          // Anchored to the button on a wide screen. On a phone the button sits far
          // enough left that a 288px panel hangs off the edge, so there it is centred
          // on the button and never wider than the screen.
          className={`${s.menu} right-0 w-72 max-sm:left-1/2 max-sm:right-auto max-sm:w-[calc(100vw-3rem)] max-sm:-translate-x-1/2`}
        >
          <div className={s.menuHead}>
            <span>Hiện</span>
            {!narrow && <span>Ghim (tối đa {MAX_PINNED})</span>}
          </div>
          {columns.map((c) => {
            const shown = isShown(c)
            const isPinned = prefs.pinned.includes(c.key)
            const up = shown ? neighbour(c, -1) : null
            const down = shown ? neighbour(c, 1) : null
            return (
              <div key={c.key} className={s.menuRow}>
                <input
                  type="checkbox"
                  role="menuitemcheckbox"
                  aria-checked={shown}
                  id={`col-${c.key}`}
                  checked={shown}
                  disabled={c.required}
                  onChange={() => onToggleColumn(c.key)}
                  aria-label={`Hiện cột ${c.label}`}
                />
                <label htmlFor={`col-${c.key}`} className="flex-1 cursor-pointer">
                  {c.label}
                </label>
                <button
                  role="menuitem"
                  className={s.arrow}
                  onClick={() => up && onMove(c.key, up)}
                  disabled={!up}
                  aria-label={`Chuyển cột ${c.label} lên`}
                >
                  ↑
                </button>
                <button
                  role="menuitem"
                  className={s.arrow}
                  onClick={() => down && onMove(c.key, down)}
                  disabled={!down}
                  aria-label={`Chuyển cột ${c.label} xuống`}
                >
                  ↓
                </button>
                {!narrow && (
                  <button
                    role="menuitemcheckbox"
                    className={s.pin}
                    onClick={() => onTogglePin(c.key)}
                    aria-checked={isPinned}
                    disabled={!isPinned && pinsLeft <= 0}
                    title={!isPinned && pinsLeft <= 0 ? `Chỉ ghim được ${MAX_PINNED} cột. Bỏ ghim một cột trước.` : undefined}
                    aria-label={`${isPinned ? 'Bỏ ghim' : 'Ghim'} cột ${c.label}`}
                  >
                    Ghim
                  </button>
                )}
              </div>
            )
          })}
          <button
            role="menuitem"
            className={`${s.item} mt-1`}
            onClick={() => { onReset(); setOpen(false) }}
          >
            Đặt lại mặc định
          </button>
        </div>
      )}
    </div>
  )
}
