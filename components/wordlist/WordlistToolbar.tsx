'use client'
import { useEffect, useRef, useState } from 'react'
import { LANGUAGES, type LangCode } from '@/lib/languages'
import type { ReviewFilter, ViewMode } from '@/lib/hooks/useWordlistFilters'
import { STATUS_OPTIONS, type WordKind, type WordStatus } from '@/lib/wordlist/types'
import type { PosGroup } from '@/lib/dictionary/pos'
import s from './Wordlist.module.css'

interface Props {
  query: string
  onQueryChange: (q: string) => void
  langFilter: LangCode | ''
  onLangFilterChange: (l: LangCode | '') => void
  statusFilter: WordStatus | ''
  onStatusFilterChange: (s: WordStatus | '') => void
  reviewFilter: ReviewFilter
  onReviewFilterChange: (r: ReviewFilter) => void
  levelFilter: string
  onLevelFilterChange: (l: string) => void
  levelOptions: string[]
  posFilter: string
  onPosFilterChange: (p: string) => void
  posOptions: PosGroup[]
  kindFilter: WordKind | ''
  onKindFilterChange: (k: WordKind | '') => void
  kindOptions: { key: WordKind; label: string }[]
  view: ViewMode
  onViewChange: (v: ViewMode) => void
  onAddClick: () => void
  onExportCsv: () => void
  onExportAnki: () => void
  onImportClick: () => void
  /** The column menu. Passed in rather than built here: it belongs to the table, and
   *  the card view has no columns to hide. */
  columnControls?: React.ReactNode
}

export function WordlistToolbar({
  query, onQueryChange, langFilter, onLangFilterChange, statusFilter, onStatusFilterChange,
  reviewFilter, onReviewFilterChange,
  levelFilter, onLevelFilterChange, levelOptions, posFilter, onPosFilterChange, posOptions,
  kindFilter, onKindFilterChange, kindOptions, view, onViewChange, onAddClick, onExportCsv, onExportAnki, onImportClick,
  columnControls,
}: Props) {
  const [exportOpen, setExportOpen] = useState(false)
  const exportRoot = useRef<HTMLDivElement>(null)

  // Same close rules as ColumnMenu beside it.
  useEffect(() => {
    if (!exportOpen) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setExportOpen(false) }
    function onDown(e: MouseEvent) {
      if (!exportRoot.current?.contains(e.target as Node)) setExportOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [exportOpen])

  return (
    <div className={s.tray}>
      <button className={s.btn} onClick={onAddClick}>
        Thêm từ
      </button>

      <input
        type="text"
        placeholder="Tìm trong sổ tay…"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        className={`${s.field} ${s.search}`}
      />

      <select
        value={langFilter}
        onChange={(e) => onLangFilterChange(e.target.value as LangCode | '')}
        className={s.field}
        aria-label="Lọc ngôn ngữ"
      >
        <option value="">Tất cả ngôn ngữ</option>
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>{l.name}</option>
        ))}
      </select>

      <select
        value={statusFilter}
        onChange={(e) => onStatusFilterChange(e.target.value as WordStatus | '')}
        className={s.field}
        aria-label="Lọc trạng thái"
      >
        <option value="">Tất cả trạng thái</option>
        {STATUS_OPTIONS.map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>

      {levelOptions.length > 1 && (
        <select
          value={levelFilter}
          onChange={(e) => onLevelFilterChange(e.target.value)}
          className={s.field}
          aria-label="Lọc trình độ"
        >
          <option value="">Tất cả trình độ</option>
          {levelOptions.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      )}

      {/* Phrasal verbs, idioms and collocations are saved beside words. */}
      {kindOptions.length > 1 && (
        <select
          value={kindFilter}
          onChange={(e) => onKindFilterChange(kindOptions.find((o) => o.key === e.target.value)?.key ?? '')}
          className={s.field}
          aria-label="Lọc loại mục"
        >
          <option value="">Từ và cụm từ</option>
          {kindOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      )}

      {posOptions.length > 1 && (
        <select
          value={posFilter}
          onChange={(e) => onPosFilterChange(e.target.value)}
          className={s.field}
          aria-label="Lọc từ loại"
        >
          <option value="">Tất cả từ loại</option>
          {/* The abbreviation leads, as it does everywhere else, but an option list has
              no column to be read in: "art." and "adv." are indistinguishable alone. */}
          {posOptions.map((g) => <option key={g.key} value={g.key}>{g.abbr} ({g.labelVi})</option>)}
        </select>
      )}

      {/* The scheduler knows which words are overdue and which keep being forgotten;
          this is where the wordlist asks it. */}
      <select
        value={reviewFilter}
        onChange={(e) => onReviewFilterChange(e.target.value as ReviewFilter)}
        className={s.field}
        aria-label="Lọc từ cần ôn"
      >
        <option value="">Tất cả từ</option>
        <option value="due">Cần ôn</option>
        <option value="leech">Hay sai</option>
      </select>

      {/* One group, so the view and file controls wrap together to the right edge. */}
      <div className={s.end}>
        <div className={s.seg}>
          <button
            aria-pressed={view === 'table'}
            onClick={() => onViewChange('table')}
            aria-label="Xem dạng bảng"
          >
            Bảng
          </button>
          <button
            aria-pressed={view === 'card'}
            onClick={() => onViewChange('card')}
            aria-label="Xem dạng lưới"
          >
            Lưới
          </button>
        </div>

        {view === 'table' && columnControls}

        <div className="relative" ref={exportRoot}>
          <button
            className={s.ghost}
            onClick={() => setExportOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={exportOpen}
          >
            Xuất ▾
          </button>
          {exportOpen && (
            <div
              role="menu"
              className={`${s.menu} right-0`}
            >
              <button
                role="menuitem"
                className={s.item}
                onClick={() => { setExportOpen(false); onExportCsv() }}
              >
                Xuất CSV
              </button>
              <button
                role="menuitem"
                className={s.item}
                onClick={() => { setExportOpen(false); onExportAnki() }}
              >
                Xuất Anki (TSV)
              </button>
            </div>
          )}
        </div>

        <button className={s.ghost} onClick={onImportClick}>
          Nhập CSV
        </button>
      </div>
    </div>
  )
}
