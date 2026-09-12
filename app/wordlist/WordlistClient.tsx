'use client'
import { Fragment, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { addWord, addWords, updateWord, updateWordsStatus, deleteWord, deleteWords } from '@/lib/wordlist/store'
import { mergeTags } from '@/lib/wordlist/tags'
import { wordsToCsv, wordsToAnkiTsv } from '@/lib/wordlist/csv'
import { downloadTextFile } from '@/lib/wordlist/download'
import { useWordlistFilters } from '@/lib/wordlist/useWordlistFilters'
import { WordlistToolbar } from '@/components/wordlist/WordlistToolbar'
import { TagFilterBar } from '@/components/wordlist/TagFilterBar'
import { BulkActionBar } from '@/components/wordlist/BulkActionBar'
import { AddWordDialog } from '@/components/wordlist/AddWordDialog'
import { EditWordDialog } from '@/components/wordlist/EditWordDialog'
import { ImportCsvDialog } from '@/components/wordlist/ImportCsvDialog'
import { WordDetail } from '@/components/wordlist/WordDetail'
import { AudioButton } from '@/components/ui/AudioButton'
import type { UserWord, WordDraft, WordStatus } from '@/lib/wordlist/types'

export function WordlistClient({ initialWords }: { initialWords: UserWord[] }) {
  const supabase = useMemo(() => createClient(), [])

  const [words, setWords] = useState<UserWord[]>(initialWords)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editWord, setEditWord] = useState<UserWord | null>(null)

  const {
    query, setQuery, langFilter, setLangFilter, statusFilter, setStatusFilter,
    tagFilter, toggleTagFilter, sortKey, sortDir, toggleSort, view, toggleView, visible,
  } = useWordlistFilters(words)

  // Select/deselect logic
  const allVisibleIds = visible.map((w) => w.id)
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selected.has(id))

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allSelected) allVisibleIds.forEach((id) => next.delete(id))
      else allVisibleIds.forEach((id) => next.add(id))
      return next
    })
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

  // CSV import: bulk-insert already-deduped drafts, then append the real rows.
  async function handleImport(drafts: WordDraft[]) {
    const added = await addWords(supabase, drafts)
    setWords((prev) => [...added, ...prev])
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

  // Bulk tag: union each selected word's own tags with the tags to add (per-row merge,
  // since a plain bulk UPDATE would overwrite each row with the same tag array).
  async function handleBulkTag(tagsToAdd: string[]) {
    const ids = [...selected]
    if (ids.length === 0) return
    const snapshot = words
    const targets = words.filter((w) => ids.includes(w.id))
    setWords((prev) => prev.map((w) => (ids.includes(w.id) ? { ...w, tags: mergeTags(w.tags, tagsToAdd) } : w)))
    try {
      const updated = await Promise.all(
        targets.map((w) => updateWord(supabase, w.id, { tags: mergeTags(w.tags, tagsToAdd) })),
      )
      setWords((prev) => prev.map((w) => updated.find((u) => u.id === w.id) ?? w))
    } catch {
      setWords(snapshot)
      alert('Không gắn thẻ được. Vui lòng thử lại.')
    }
  }

  // Bulk status change
  async function handleBulkStatus(status: WordStatus) {
    const ids = [...selected]
    if (ids.length === 0) return
    const snapshot = words
    setWords((prev) => prev.map((w) => (ids.includes(w.id) ? { ...w, status } : w)))
    try {
      await updateWordsStatus(supabase, ids, status)
    } catch {
      setWords(snapshot)
      alert('Không đổi được trạng thái. Vui lòng thử lại.')
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

  function handleExportCsv() {
    downloadTextFile('wordlist.csv', wordsToCsv(visible), 'text/csv;charset=utf-8')
  }

  function handleExportAnki() {
    downloadTextFile('wordlist-anki.tsv', wordsToAnkiTsv(visible), 'text/tab-separated-values;charset=utf-8')
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
      <WordlistToolbar
        query={query}
        onQueryChange={setQuery}
        langFilter={langFilter}
        onLangFilterChange={setLangFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        view={view}
        onViewChange={toggleView}
        onAddClick={() => setAddOpen(true)}
        onExportCsv={handleExportCsv}
        onExportAnki={handleExportAnki}
        onImportClick={() => setImportOpen(true)}
      />

      <TagFilterBar words={words} activeTag={tagFilter} onToggle={toggleTagFilter} />

      <BulkActionBar
        selectedCount={selectedCount}
        onBulkTag={handleBulkTag}
        onBulkStatus={handleBulkStatus}
        onBulkDelete={handleBulkDelete}
      />

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
                <th className="py-2 pr-3">Thẻ</th>
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
                    <td className="ipa py-2 pr-3 text-black/50">{w.ipa ?? ''}</td>
                    <td className="py-2 pr-3 text-black/50">{w.pos ?? ''}</td>
                    <td className="py-2 pr-3">{w.meaningVi ?? ''}</td>
                    <td className="py-2 pr-3 text-black/50">{w.level ?? ''}</td>
                    <td className="py-2 pr-3 text-black/50 max-w-xs truncate">{w.example ?? ''}</td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap gap-1">
                        {w.tags.map((t) => (
                          <span key={t} className="rounded-full bg-black/5 px-1.5 py-0.5 text-xs text-black/60">{t}</span>
                        ))}
                      </div>
                    </td>
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
                      <td colSpan={11} className="px-4 py-3">
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
                  {w.ipa && <span className="ipa text-xs text-black/50">{w.ipa}</span>}
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
              {w.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {w.tags.map((t) => (
                    <span key={t} className="rounded-full bg-black/5 px-1.5 py-0.5 text-xs text-black/60">{t}</span>
                  ))}
                </div>
              )}

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

      <ImportCsvDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        existing={words}
        onImport={handleImport}
      />
    </div>
  )
}
