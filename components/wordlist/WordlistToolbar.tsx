'use client'
import { useState } from 'react'
import { LANGUAGES, type LangCode } from '@/lib/languages'
import type { ReviewFilter, ViewMode } from '@/lib/hooks/useWordlistFilters'
import { STATUS_OPTIONS, type WordStatus } from '@/lib/wordlist/types'

interface Props {
  query: string
  onQueryChange: (q: string) => void
  langFilter: LangCode | ''
  onLangFilterChange: (l: LangCode | '') => void
  statusFilter: WordStatus | ''
  onStatusFilterChange: (s: WordStatus | '') => void
  reviewFilter: ReviewFilter
  onReviewFilterChange: (r: ReviewFilter) => void
  view: ViewMode
  onViewChange: (v: ViewMode) => void
  onAddClick: () => void
  onExportCsv: () => void
  onExportAnki: () => void
  onImportClick: () => void
}

export function WordlistToolbar({
  query, onQueryChange, langFilter, onLangFilterChange, statusFilter, onStatusFilterChange,
  reviewFilter, onReviewFilterChange, view, onViewChange, onAddClick, onExportCsv, onExportAnki, onImportClick,
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

      {/* The scheduler already knows which words are overdue and which keep being
          forgotten; until now the wordlist had no way to ask it. */}
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
