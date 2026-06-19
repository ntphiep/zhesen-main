'use client'
import { Fragment, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { addWord, updateWord, deleteWord, deleteWords } from '@/lib/wordlist/store'
import { AddWordDialog } from '@/components/wordlist/AddWordDialog'
import { EditWordDialog } from '@/components/wordlist/EditWordDialog'
import { WordDetail } from '@/components/wordlist/WordDetail'
import { AudioButton } from '@/components/AudioButton'
import type { UserWord, WordDraft } from '@/lib/wordlist/types'
import type { LangCode } from '@/lib/content/types'

type ViewMode = 'table' | 'card'
type SortKey = 'headword' | 'createdAt'
type SortDir = 'asc' | 'desc'

function getInitialView(): ViewMode {
  if (typeof window === 'undefined') return 'table'
  const saved = window.localStorage.getItem('wordlist_view')
  return saved === 'card' ? 'card' : 'table'
}

export function WordlistClient({ initialWords }: { initialWords: UserWord[] }) {
  const supabase = useMemo(() => createClient(), [])

  const [words, setWords] = useState<UserWord[]>(initialWords)
  const [query, setQuery] = useState('')
  const [langFilter, setLangFilter] = useState<LangCode | ''>('')
  const [statusFilter, setStatusFilter] = useState<'new' | 'learning' | 'known' | ''>('')
  const [sortKey, setSortKey] = useState<SortKey>('createdAt')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [view, setView] = useState<ViewMode>(getInitialView)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [editWord, setEditWord] = useState<UserWord | null>(null)

  // Derived visible list: filter + sort, no DB calls
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = words.filter((w) => {
      if (langFilter && w.lang !== langFilter) return false
      if (statusFilter && w.status !== statusFilter) return false
      if (q) {
        const inHead = w.headword.toLowerCase().includes(q)
        const inMeaningVi = (w.meaningVi ?? '').toLowerCase().includes(q)
        const inMeaningEn = (w.meaningEn ?? '').toLowerCase().includes(q)
        if (!inHead && !inMeaningVi && !inMeaningEn) return false
      }
      return true
    })

    list = [...list].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'headword') {
        cmp = a.headword.localeCompare(b.headword)
      } else {
        cmp = a.createdAt.localeCompare(b.createdAt)
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return list
  }, [words, query, langFilter, statusFilter, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  function toggleView(v: ViewMode) {
    setView(v)
    localStorage.setItem('wordlist_view', v)
  }

  // Select/deselect logic
  const allVisibleIds = visible.map((w) => w.id)
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selected.has(id))

  function toggleSelectAll() {
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev)
        allVisibleIds.forEach((id) => next.delete(id))
        return next
      })
    } else {
      setSelected((prev) => {
        const next = new Set(prev)
        allVisibleIds.forEach((id) => next.add(id))
        return next
      })
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Optimistic add
  async function handleAdd(draft: WordDraft) {
    const tempId = crypto.randomUUID()
    const tempWord: UserWord = {
      id: tempId,
      lang: draft.lang,
      entryId: draft.entryId,
      headword: draft.headword,
      reading: draft.reading,
      ipa: draft.ipa,
      pos: draft.pos,
      meaningVi: draft.meaningVi,
      meaningEn: draft.meaningEn,
      level: draft.level,
      example: draft.example,
      exampleTranslation: draft.exampleTranslation,
      audioUrl: draft.audioUrl,
      notes: draft.notes,
      status: draft.status,
      tags: draft.tags,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    setWords((prev) => [tempWord, ...prev])
    setAddOpen(false)
    try {
      const real = await addWord(supabase, draft)
      setWords((prev) => prev.map((w) => (w.id === tempId ? real : w)))
    } catch {
      setWords((prev) => prev.filter((w) => w.id !== tempId))
      alert('Không thêm được từ. Vui lòng thử lại.')
    }
  }

  // Optimistic delete
  async function handleDelete(id: string, headword: string) {
    if (!window.confirm(`Xóa từ "${headword}"?`)) return
    let snapshot: UserWord[] = []
    setWords((prev) => { snapshot = prev; return prev.filter((w) => w.id !== id) })
    setSelected((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    try {
      await deleteWord(supabase, id)
    } catch {
      setWords(snapshot)
      alert('Không xóa được từ. Vui lòng thử lại.')
    }
  }

  // Bulk delete
  async function handleBulkDelete() {
    const ids = [...selected]
    if (ids.length === 0) return
    if (!window.confirm(`Xóa ${ids.length} từ đã chọn?`)) return
    let snapshot: UserWord[] = []
    setWords((prev) => { snapshot = prev; return prev.filter((w) => !ids.includes(w.id)) })
    setSelected(new Set())
    try {
      await deleteWords(supabase, ids)
    } catch {
      setWords(snapshot)
      setSelected(new Set(ids))
      alert('Không xóa được từ. Vui lòng thử lại.')
    }
  }

  // Optimistic edit
  async function handleSave(id: string, patch: Partial<WordDraft>) {
    const original = words.find((w) => w.id === id)
    if (!original) return
    setWords((prev) => prev.map((w) => (w.id === id ? { ...w, ...patch } : w)))
    setEditWord(null)
    try {
      const updated = await updateWord(supabase, id, patch)
      setWords((prev) => prev.map((w) => (w.id === id ? updated : w)))
    } catch {
      setWords((prev) => prev.map((w) => (w.id === id ? original : w)))
      alert('Không lưu được thay đổi. Vui lòng thử lại.')
    }
  }

  function formatDate(iso: string) {
    try {
      return new Date(iso).toLocaleDateString('vi-VN')
    } catch {
      return iso
    }
  }

  const selectedCount = selected.size

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="rounded-lg bg-black px-4 py-2 text-sm text-white"
          onClick={() => setAddOpen(true)}
        >
          Thêm từ
        </button>

        <input
          type="text"
          placeholder="Tìm trong danh sách..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="rounded-lg border border-black/15 px-3 py-2 text-sm flex-1 min-w-40"
        />

        <select
          value={langFilter}
          onChange={(e) => setLangFilter(e.target.value as LangCode | '')}
          className="rounded-lg border border-black/15 px-3 py-2 text-sm bg-white"
          aria-label="Lọc ngôn ngữ"
        >
          <option value="">Tất cả ngôn ngữ</option>
          <option value="en">Tiếng Anh</option>
          <option value="zh">Tiếng Trung</option>
          <option value="es">Tiếng Tây Ban Nha</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'new' | 'learning' | 'known' | '')}
          className="rounded-lg border border-black/15 px-3 py-2 text-sm bg-white"
          aria-label="Lọc trạng thái"
        >
          <option value="">Tất cả trạng thái</option>
          <option value="new">Mới</option>
          <option value="learning">Đang học</option>
          <option value="known">Đã biết</option>
        </select>

        <div className="flex rounded-lg border border-black/15 overflow-hidden">
          <button
            className={`px-3 py-2 text-sm ${view === 'table' ? 'bg-black text-white' : 'bg-white text-black/60'}`}
            onClick={() => toggleView('table')}
            aria-label="Chế độ bảng"
          >
            Bảng
          </button>
          <button
            className={`px-3 py-2 text-sm ${view === 'card' ? 'bg-black text-white' : 'bg-white text-black/60'}`}
            onClick={() => toggleView('card')}
            aria-label="Chế độ thẻ"
          >
            Thẻ
          </button>
        </div>

        {selectedCount > 0 && (
          <button
            className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white"
            onClick={handleBulkDelete}
          >
            Xóa đã chọn ({selectedCount})
          </button>
        )}
      </div>

      {/* Empty state */}
      {visible.length === 0 && (
        <p className="text-center text-sm text-black/40 py-12">
          {words.length === 0
            ? 'Chưa có từ nào. Bấm Thêm từ để bắt đầu.'
            : 'Chưa có từ nào khớp với bộ lọc.'}
        </p>
      )}

      {/* Table view */}
      {view === 'table' && visible.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-black/10 text-left text-black/50">
                <th className="py-2 pr-3 w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    aria-label="Chọn tất cả"
                  />
                </th>
                <th className="py-2 pr-3">
                  <button
                    className="flex items-center gap-1 font-medium hover:text-black"
                    onClick={() => toggleSort('headword')}
                  >
                    Từ
                    {sortKey === 'headword' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                  </button>
                </th>
                <th className="py-2 pr-3">IPA</th>
                <th className="py-2 pr-3">Từ loại</th>
                <th className="py-2 pr-3">Nghĩa</th>
                <th className="py-2 pr-3">Cấp độ</th>
                <th className="py-2 pr-3">Ngữ cảnh</th>
                <th className="py-2 pr-3">
                  <button
                    className="flex items-center gap-1 font-medium hover:text-black"
                    onClick={() => toggleSort('createdAt')}
                  >
                    Ngày thêm
                    {sortKey === 'createdAt' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                  </button>
                </th>
                <th className="py-2 pr-3">Audio</th>
                <th className="py-2">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((w) => (
                <Fragment key={w.id}>
                  <tr className="border-b border-black/5 hover:bg-black/2">
                    <td className="py-2 pr-3">
                      <input
                        type="checkbox"
                        checked={selected.has(w.id)}
                        onChange={() => toggleSelect(w.id)}
                        aria-label={`Chọn từ ${w.headword}`}
                      />
                    </td>
                    <td className="py-2 pr-3 font-medium">{w.headword}</td>
                    <td className="py-2 pr-3 font-mono text-black/50">{w.ipa ?? ''}</td>
                    <td className="py-2 pr-3 text-black/50">{w.pos ?? ''}</td>
                    <td className="py-2 pr-3">{w.meaningVi ?? ''}</td>
                    <td className="py-2 pr-3 text-black/50">{w.level ?? ''}</td>
                    <td className="py-2 pr-3 text-black/50 max-w-xs truncate">{w.example ?? ''}</td>
                    <td className="py-2 pr-3 text-black/40">{formatDate(w.createdAt)}</td>
                    <td className="py-2 pr-3">
                      <AudioButton text={w.headword} lang={w.lang} audioUrl={w.audioUrl} />
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-1">
                        <button
                          className="rounded px-2 py-1 text-xs hover:bg-black/5"
                          onClick={() => setExpandedId(expandedId === w.id ? null : w.id)}
                          aria-label={`Xem chi tiết ${w.headword}`}
                        >
                          Xem
                        </button>
                        <button
                          className="rounded px-2 py-1 text-xs hover:bg-black/5"
                          onClick={() => setEditWord(w)}
                          aria-label={`Sửa từ ${w.headword}`}
                        >
                          Sửa
                        </button>
                        <button
                          className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                          onClick={() => handleDelete(w.id, w.headword)}
                          aria-label={`Xóa từ ${w.headword}`}
                        >
                          Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === w.id && (
                    <tr className="bg-black/2">
                      <td colSpan={10} className="px-4 py-3">
                        <WordDetail word={w} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Card view */}
      {view === 'card' && visible.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visible.map((w) => (
            <div
              key={w.id}
              className="rounded-xl border border-black/10 p-4 flex flex-col gap-2 bg-white"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selected.has(w.id)}
                    onChange={() => toggleSelect(w.id)}
                    aria-label={`Chọn từ ${w.headword}`}
                  />
                  <span className="font-semibold">{w.headword}</span>
                  {w.ipa && <span className="font-mono text-xs text-black/50">{w.ipa}</span>}
                </div>
                <AudioButton text={w.headword} lang={w.lang} audioUrl={w.audioUrl} />
              </div>

              {w.pos && <span className="text-xs text-black/40 uppercase">{w.pos}</span>}
              {w.meaningVi && <p className="text-sm text-black/80">{w.meaningVi}</p>}
              {w.level && (
                <span className="self-start rounded-full bg-black/5 px-2 py-0.5 text-xs text-black/50">
                  {w.level}
                </span>
              )}
              {w.example && <p className="text-xs italic text-black/50">{w.example}</p>}

              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-black/30">{formatDate(w.createdAt)}</span>
                <div className="flex gap-1">
                  <button
                    className="rounded px-2 py-1 text-xs hover:bg-black/5"
                    onClick={() => setExpandedId(expandedId === w.id ? null : w.id)}
                    aria-label={`Xem chi tiết ${w.headword}`}
                  >
                    Xem
                  </button>
                  <button
                    className="rounded px-2 py-1 text-xs hover:bg-black/5"
                    onClick={() => setEditWord(w)}
                    aria-label={`Sửa từ ${w.headword}`}
                  >
                    Sửa
                  </button>
                  <button
                    className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                    onClick={() => handleDelete(w.id, w.headword)}
                    aria-label={`Xóa từ ${w.headword}`}
                  >
                    Xóa
                  </button>
                </div>
              </div>

              {expandedId === w.id && (
                <div className="pt-2 border-t border-black/5">
                  <WordDetail word={w} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Dialogs */}
      <AddWordDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={handleAdd}
      />

      <EditWordDialog
        word={editWord}
        open={editWord !== null}
        onClose={() => setEditWord(null)}
        onSave={handleSave}
      />
    </div>
  )
}
