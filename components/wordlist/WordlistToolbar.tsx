'use client'
import { useState } from 'react'
import { LANGUAGES, type LangCode } from '@/lib/languages'
import type { ReviewFilter, ViewMode } from '@/lib/hooks/useWordlistFilters'
import { STATUS_OPTIONS, type WordStatus } from '@/lib/wordlist/types'
import type { PosGroup } from '@/lib/dictionary/pos'

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
  levelFilter, onLevelFilterChange, levelOptions, posFilter, onPosFilterChange, posOptions, view, onViewChange, onAddClick, onExportCsv, onExportAnki, onImportClick,
  columnControls,
}: Props) {
  const [exportOpen, setExportOpen] = useState(false)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className="rounded-lg bg-black px-4 py-2 text-sm text-white" onClick={onAddClick}>
        Thêm từ
      </button>

      <input
        type="text"
        placeholder="Tìm trong danh sách..."
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        className="rounded-lg border border-black/15 px-3 py-2 text-sm flex-1 min-w-40"
      />

      <select
        value={langFilter}
        onChange={(e) => onLangFilterChange(e.target.value as LangCode | '')}
        className="rounded-lg border border-black/15 px-3 py-2 text-sm bg-white"
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
        className="rounded-lg border border-black/15 px-3 py-2 text-sm bg-white"
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
          className="rounded-lg border border-black/15 px-3 py-2 text-sm bg-white"
          aria-label="Lọc cấp độ"
        >
          <option value="">Tất cả cấp độ</option>
          {levelOptions.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      )}

      {posOptions.length > 1 && (
        <select
          value={posFilter}
          onChange={(e) => onPosFilterChange(e.target.value)}
          className="rounded-lg border border-black/15 px-3 py-2 text-sm bg-white"
          aria-label="Lọc từ loại"
        >
          <option value="">Tất cả từ loại</option>
          {/* The abbreviation leads, as it does everywhere else, but an option list has
              no column to be read in: "art." and "adv." are indistinguishable alone. */}
          {posOptions.map((g) => <option key={g.key} value={g.key}>{g.abbr} — {g.labelVi}</option>)}
        </select>
      )}

      {/* The scheduler knows which words are overdue and which keep being forgotten;
          this is where the wordlist asks it. */}
      <select
        value={reviewFilter}
        onChange={(e) => onReviewFilterChange(e.target.value as ReviewFilter)}
        className="rounded-lg border border-black/15 px-3 py-2 text-sm bg-white"
        aria-label="Lọc ôn tập"
      >
        <option value="">Tất cả từ</option>
        <option value="due">Cần ôn</option>
        <option value="leech">Hay sai</option>
      </select>

      <div className="flex rounded-lg border border-black/15 overflow-hidden">
        <button
          className={`px-3 py-2 text-sm ${view === 'table' ? 'bg-black text-white' : 'bg-white text-black/60'}`}
          onClick={() => onViewChange('table')}
          aria-label="Chế độ bảng"
        >
          Bảng
        </button>
        <button
          className={`px-3 py-2 text-sm ${view === 'card' ? 'bg-black text-white' : 'bg-white text-black/60'}`}
          onClick={() => onViewChange('card')}
          aria-label="Chế độ thẻ"
        >
          Thẻ
        </button>
      </div>

      {view === 'table' && columnControls}

      <div className="relative">
        <button
          className="rounded-lg border border-black/15 px-3 py-2 text-sm hover:bg-black/5"
          onClick={() => setExportOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={exportOpen}
        >
          Xuất ▾
        </button>
        {exportOpen && (
          <div
            role="menu"
            className="absolute right-0 z-10 mt-1 flex flex-col rounded-lg border border-black/10 bg-white shadow-lg"
          >
            <button
              role="menuitem"
              className="px-4 py-2 text-left text-sm hover:bg-black/5 whitespace-nowrap"
              onClick={() => { setExportOpen(false); onExportCsv() }}
            >
              Xuất CSV
            </button>
            <button
              role="menuitem"
              className="px-4 py-2 text-left text-sm hover:bg-black/5 whitespace-nowrap"
              onClick={() => { setExportOpen(false); onExportAnki() }}
            >
              Xuất Anki (TSV)
            </button>
          </div>
        )}
      </div>

      <button className="rounded-lg border border-black/15 px-3 py-2 text-sm hover:bg-black/5" onClick={onImportClick}>
        Nhập CSV
      </button>
    </div>
  )
}
