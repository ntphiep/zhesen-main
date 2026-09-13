'use client'
import { Fragment, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { addWord, addWords, updateWord, updateWordsStatus, deleteWord, deleteWords } from '@/lib/wordlist/store'
import { mergeTags } from '@/lib/wordlist/tags'
import { formatWordDate } from '@/lib/wordlist/format'
import { posGroup } from '@/lib/dictionary/pos'
import { wordsToCsv, wordsToAnkiTsv } from '@/lib/wordlist/csv'
import { downloadTextFile } from '@/lib/wordlist/download'
import { useWordlistFilters } from '@/lib/hooks/useWordlistFilters'
import { WordlistToolbar } from '@/components/wordlist/WordlistToolbar'
import { TagFilterBar } from '@/components/wordlist/TagFilterBar'
import { BulkActionBar } from '@/components/wordlist/BulkActionBar'
import { AddWordDialog } from '@/components/wordlist/AddWordDialog'
import { EditWordDialog } from '@/components/wordlist/EditWordDialog'
import { ImportCsvDialog } from '@/components/wordlist/ImportCsvDialog'
import { WordDetail } from '@/components/wordlist/WordDetail'
import { TagChips, WordRowActions } from '@/components/wordlist/WordRowActions'
import { AudioButton } from '@/components/ui/AudioButton'
import type { UserWord, WordDraft, WordStatus } from '@/lib/wordlist/types'
import { Ipa } from '@/components/ui/Ipa'

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

  const allVisibleIds = visible.map((w) => w.id)
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selected.has(id))

  // Render a page at a time. The list is 400+ rows for a real learner and every
  // row mounts an audio button and a row-actions group, so rendering the whole
  // thing cost a visible pause on every keystroke in the filter box. Selection
  // and export still work on the full filtered set, not on what is on screen.
  const PAGE_SIZE = 50
  const [limit, setLimit] = useState(PAGE_SIZE)
  const filterSignature = `${query}|${langFilter}|${statusFilter}|${tagFilter}|${sortKey}|${sortDir}`
  const [prevSignature, setPrevSignature] = useState(filterSignature)
  if (filterSignature !== prevSignature) {
    setPrevSignature(filterSignature)
    setLimit(PAGE_SIZE)
  }
  const shown = visible.slice(0, limit)

  // Which dictionary entries are already saved, so the add dialog can say "Đã có"
  // rather than let the insert fail against the unique index from migration 0031.
  const savedEntryIds = useMemo(
    () => new Set(words.map((w) => w.entryId).filter((id): id is string => id !== null)),
    [words],
  )

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
  // The preview dedupes against the list as it was when the file was opened, so
  // a word saved in another tab since then comes back as one fewer row here
  // rather than as an error. Say so instead of quietly importing less.
  async function handleImport(drafts: WordDraft[]) {
    const added = await addWords(supabase, drafts)
    setWords((prev) => [...added, ...prev])
    const skipped = drafts.length - added.length
    if (skipped > 0) alert(`Đã bỏ qua ${skipped} từ vì đã có trong sổ tay.`)
  }

  async function handleDelete(id: string, headword: string) {
    if (!window.confirm(`Xóa từ "${headword}"?`)) return
    // Snapshot from the rendered list, not from inside the updater: React is free to
    // call an updater more than once, and the assignment would not have landed yet
    // when the catch block below reads it.
    const snapshot = words
    setWords((prev) => prev.filter((w) => w.id !== id))
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

  async function handleBulkDelete() {
    const ids = [...selected]
    if (ids.length === 0) return
    if (!window.confirm(`Xóa ${ids.length} từ đã chọn?`)) return
    const snapshot = words
    setWords((prev) => prev.filter((w) => !ids.includes(w.id)))
    setSelected(new Set())
    try {
      await deleteWords(supabase, ids)
    } catch {
      setWords(snapshot)
      setSelected(new Set(ids))
      alert('Không xóa được từ. Vui lòng thử lại.')
    }
  }

  // Bulk tag: union each selected word's own tags with the tags to add. It has to
  // be one request per row, because a flat bulk UPDATE would write the same tag
  // array over every row and an upsert cannot carry a partial row past the
  // table's NOT NULL columns.
  //
  // `allSettled`, not `all`. `all` rejects on the first failure while the other
  // requests are already in flight and land anyway: tagging 200 words with one
  // network blip left 199 rows tagged in the database, the whole list rolled
  // back on screen, and an alert saying it had failed. The learner then filtered
  // by that tag and found words the app had just told them were not tagged.
  //
  // So each row is settled on its own result: the ones that saved keep the tag,
  // only the ones that failed go back, and the message says how many.
  async function handleBulkTag(tagsToAdd: string[]) {
    const ids = [...selected]
    if (ids.length === 0) return
    const targets = words.filter((w) => ids.includes(w.id))
    setWords((prev) => prev.map((w) => (ids.includes(w.id) ? { ...w, tags: mergeTags(w.tags, tagsToAdd) } : w)))

    const results = await Promise.allSettled(
      targets.map((w) => updateWord(supabase, w.id, { tags: mergeTags(w.tags, tagsToAdd) })),
    )
    const saved = new Map<string, UserWord>()
    const lost = new Map<string, UserWord>()
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') saved.set(r.value.id, r.value)
      else lost.set(targets[i].id, targets[i])
    })
    setWords((prev) => prev.map((w) => saved.get(w.id) ?? lost.get(w.id) ?? w))
    if (lost.size > 0) alert(`Không gắn thẻ được cho ${lost.size} từ. Vui lòng thử lại.`)
  }

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

  async function handleSave(id: string, patch: Partial<WordDraft>) {
    const original = words.find((w) => w.id === id)
    if (!original) return
    setEditWord(null)
    // The dialog reports only the fields that changed, so opening a word and
    // pressing Lưu without touching anything sends an empty patch. PostgREST
    // refuses an empty update, which surfaced as "Không lưu được thay đổi" for
    // a save that had nothing to save.
    if (Object.keys(patch).length === 0) return
    setWords((prev) => prev.map((w) => (w.id === id ? { ...w, ...patch } : w)))
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
      {view === 'table' && shown.length > 0 && (
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
              {shown.map((w) => (
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
                    <td className="py-2 pr-3 text-black/50"><Ipa value={w.ipa} lang={w.lang} /></td>
                    <td className="py-2 pr-3 text-black/50">{posGroup(w.pos)?.labelVi ?? w.pos ?? ''}</td>
                    <td className="py-2 pr-3">{w.meaningVi ?? ''}</td>
                    <td className="py-2 pr-3 text-black/50">{w.level ?? ''}</td>
                    <td className="py-2 pr-3 text-black/50 max-w-xs truncate">{w.example ?? ''}</td>
                    <td className="py-2 pr-3">
                      <TagChips tags={w.tags} />
                    </td>
                    <td className="py-2 pr-3 text-black/40">{formatWordDate(w.createdAt)}</td>
                    <td className="py-2 pr-3">
                      <AudioButton text={w.headword} lang={w.lang} audioUrl={w.audioUrl} />
                    </td>
                    <td className="py-2">
                      <WordRowActions
                        word={w}
                        expanded={expandedId === w.id}
                        onToggleDetail={() => setExpandedId(expandedId === w.id ? null : w.id)}
                        onEdit={() => setEditWord(w)}
                        onDelete={() => handleDelete(w.id, w.headword)}
                      />
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
      {view === 'card' && shown.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {shown.map((w) => (
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
                  <Ipa value={w.ipa} lang={w.lang} className="text-xs text-black/50" />
                </div>
                <AudioButton text={w.headword} lang={w.lang} audioUrl={w.audioUrl} />
              </div>

              {w.pos && <span className="text-xs text-black/55">{posGroup(w.pos)?.labelVi ?? w.pos}</span>}
              {w.meaningVi && <p className="text-sm text-black/80">{w.meaningVi}</p>}
              {w.level && (
                <span className="self-start rounded-full bg-black/5 px-2 py-0.5 text-xs text-black/50">
                  {w.level}
                </span>
              )}
              {w.example && <p className="text-xs italic text-black/50">{w.example}</p>}
                              <TagChips tags={w.tags} />

              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-black/30">{formatWordDate(w.createdAt)}</span>
                <WordRowActions
                  word={w}
                  expanded={expandedId === w.id}
                  onToggleDetail={() => setExpandedId(expandedId === w.id ? null : w.id)}
                  onEdit={() => setEditWord(w)}
                  onDelete={() => handleDelete(w.id, w.headword)}
                />
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

      {visible.length > shown.length && (
        <div className="flex items-center justify-center gap-3 py-2 text-sm">
          <span className="text-black/40">Đang xem {shown.length} / {visible.length} từ</span>
          <button
            className="rounded-lg border border-black/15 px-3 py-1.5 font-medium text-black/70 hover:bg-black/5"
            onClick={() => setLimit((n) => n + PAGE_SIZE)}
          >
            Xem thêm
          </button>
        </div>
      )}

      {/* Dialogs */}
      <AddWordDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={handleAdd}
        savedEntryIds={savedEntryIds}
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
