'use client'
import { Fragment, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { addWord, addWords, listWords, updateWord, updateWordsStatus, deleteWord, deleteWords } from '@/lib/wordlist/store'
import { mergeTags, tagCounts } from '@/lib/wordlist/tags'
import { formatWordDate, isDueAt, DUE_LABEL } from '@/lib/wordlist/format'
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
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { NoticeBar, useNotice } from '@/components/ui/Notice'

export function WordlistClient({ initialWords }: { initialWords: UserWord[] }) {
  const supabase = useMemo(() => createClient(), [])

  const [words, setWords] = useState<UserWord[]>(initialWords)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editWord, setEditWord] = useState<UserWord | null>(null)
  const { notice, notify, dismiss } = useNotice()
  // One slot, not a flag per action: the dialog carries its own wording and the
  // work to run, so a third destructive action needs no new state.
  const [confirming, setConfirming] = useState<
    { title: string; message: string; confirmLabel: string; run: () => void } | null
  >(null)

  const {
    query, setQuery, langFilter, setLangFilter, statusFilter, setStatusFilter,
    reviewFilter, setReviewFilter, tagFilter, toggleTagFilter,
    levelFilter, setLevelFilter, levelOptions, posFilter, setPosFilter, posOptions,
    sortKey, sortDir, toggleSort, view, toggleView, visible,
  } = useWordlistFilters(words)

  const allVisibleIds = visible.map((w) => w.id)
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selected.has(id))

  // 400+ rows for a real learner, each mounting an audio button and a row-actions
  // group. Selection and export still use the full filtered set, not what is on screen.
  const PAGE_SIZE = 50
  const [limit, setLimit] = useState(PAGE_SIZE)
  // tagFilter is a Set and must be spelled out: interpolated it gives "[object Set]"
  // for every combination, so the page size would never reset.
  const filterSignature =
    `${query}|${langFilter}|${statusFilter}|${reviewFilter}|${levelFilter}|${posFilter}|${[...tagFilter].join(',')}|${sortKey}|${sortDir}`
  const [prevSignature, setPrevSignature] = useState(filterSignature)
  if (filterSignature !== prevSignature) {
    setPrevSignature(filterSignature)
    setLimit(PAGE_SIZE)
  }
  const shown = visible.slice(0, limit)

  // Lets the add dialog say "Đã có" instead of letting the insert fail against the
  // unique index from migration 0031.
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
      // What the database writes for a new row: due immediately, never missed.
      fsrsDueAt: new Date().toISOString(),
      fsrsLapses: 0,
    }
    setWords((prev) => [tempWord, ...prev])
    setAddOpen(false)
    try {
      const real = await addWord(supabase, draft)
      setWords((prev) => prev.map((w) => (w.id === tempId ? real : w)))
    } catch {
      setWords((prev) => prev.filter((w) => w.id !== tempId))
      notify('Không thêm được từ. Vui lòng thử lại.')
    }
  }

  // The preview dedupes against the list as of file-open, so a word saved in another
  // tab since then returns as a skip, which must be reported rather than swallowed.
  async function handleImport(drafts: WordDraft[]) {
    try {
      const added = await addWords(supabase, drafts)
      const skipped = drafts.length - added.length
      if (skipped > 0) notify(`Đã bỏ qua ${skipped} từ vì đã có trong sổ tay.`, 'info')
    } finally {
      // An import is chunked, so a failure part way through leaves earlier chunks
      // written. Show what the database now holds, whatever happened.
      const fresh = await listWords(supabase).catch(() => null)
      if (fresh) setWords(fresh)
    }
  }

  function handleDelete(id: string, headword: string) {
    setConfirming({
      title: 'Xóa từ',
      message: `Xóa "${headword}" khỏi sổ tay? Tiến độ ôn tập của từ này mất theo.`,
      confirmLabel: 'Xóa',
      run: () => void deleteOne(id),
    })
  }

  async function deleteOne(id: string) {
    // Snapshot outside the updater: React may call an updater more than once, and the
    // catch below needs the pre-delete list.
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
      notify('Không xóa được từ. Vui lòng thử lại.')
    }
  }

  function handleBulkDelete() {
    const ids = [...selected]
    if (ids.length === 0) return
    setConfirming({
      title: 'Xóa nhiều từ',
      message: `Xóa ${ids.length} từ đã chọn khỏi sổ tay? Tiến độ ôn tập của những từ này mất theo.`,
      confirmLabel: `Xóa ${ids.length} từ`,
      run: () => void deleteMany(ids),
    })
  }

  async function deleteMany(ids: string[]) {
    const snapshot = words
    setWords((prev) => prev.filter((w) => !ids.includes(w.id)))
    setSelected(new Set())
    try {
      await deleteWords(supabase, ids)
    } catch {
      setWords(snapshot)
      setSelected(new Set(ids))
      notify('Không xóa được từ. Vui lòng thử lại.')
    }
  }

  // One request per row: a flat bulk UPDATE would write the same tag array over every
  // row, and an upsert cannot carry a partial row past the table's NOT NULL columns.
  async function applyTags(tagsFor: (w: UserWord) => string[]) {
    const ids = [...selected]
    if (ids.length === 0) return
    // Skip rows whose tags would not change: the assistant often returns tags
    // that are already stored.
    const merged = new Map<string, string[]>()
    for (const w of words) {
      if (!ids.includes(w.id)) continue
      const next = mergeTags(w.tags, tagsFor(w))
      if (next.length !== w.tags.length) merged.set(w.id, next)
    }
    const targets = words.filter((w) => merged.has(w.id))
    if (targets.length === 0) return
    setWords((prev) => prev.map((w) => (merged.has(w.id) ? { ...w, tags: merged.get(w.id)! } : w)))

    const results = await Promise.allSettled(
      targets.map((w) => updateWord(supabase, w.id, { tags: merged.get(w.id)! })),
    )
    const saved = new Map<string, UserWord>()
    const lost = new Map<string, UserWord>()
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') saved.set(r.value.id, r.value)
      else lost.set(targets[i].id, targets[i])
    })
    setWords((prev) => prev.map((w) => saved.get(w.id) ?? lost.get(w.id) ?? w))
    if (lost.size > 0) notify(`Không gắn thẻ được cho ${lost.size} từ. Vui lòng thử lại.`)
  }

  const handleBulkTag = (tagsToAdd: string[]) => applyTags(() => tagsToAdd)

  // Per word, so a word the assistant skipped keeps its own tags. The key carries the
  // language because "no" exists in both English and Spanish.
  const handleAiTag = (tagsByKey: Map<string, string[]>) =>
    applyTags((w) => tagsByKey.get(`${w.lang}:${w.headword}`) ?? [])

  async function handleBulkStatus(status: WordStatus) {
    const ids = [...selected]
    if (ids.length === 0) return
    const snapshot = words
    setWords((prev) => prev.map((w) => (ids.includes(w.id) ? { ...w, status } : w)))
    try {
      await updateWordsStatus(supabase, ids, status)
    } catch {
      setWords(snapshot)
      notify('Không đổi được trạng thái. Vui lòng thử lại.')
    }
  }

  async function handleSave(id: string, patch: Partial<WordDraft>) {
    const original = words.find((w) => w.id === id)
    if (!original) return
    setEditWord(null)
    // The dialog reports only changed fields, so an untouched save sends an empty
    // patch, and PostgREST refuses an empty update.
    if (Object.keys(patch).length === 0) return
    setWords((prev) => prev.map((w) => (w.id === id ? { ...w, ...patch } : w)))
    try {
      const updated = await updateWord(supabase, id, patch)
      setWords((prev) => prev.map((w) => (w.id === id ? updated : w)))
    } catch {
      setWords((prev) => prev.map((w) => (w.id === id ? original : w)))
      notify('Không lưu được thay đổi. Vui lòng thử lại.')
    }
  }

  function handleExportCsv() {
    downloadTextFile('wordlist.csv', wordsToCsv(visible), 'text/csv;charset=utf-8')
  }

  function handleExportAnki() {
    downloadTextFile('wordlist-anki.tsv', wordsToAnkiTsv(visible), 'text/tab-separated-values;charset=utf-8')
  }

  const selectedWords = words.filter((w) => selected.has(w.id))
  const allTags = tagCounts(words).map((t) => t.tag)

  return (
    <div className="flex flex-col gap-4">
      <WordlistToolbar
        query={query}
        onQueryChange={setQuery}
        langFilter={langFilter}
        onLangFilterChange={setLangFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        reviewFilter={reviewFilter}
        onReviewFilterChange={setReviewFilter}
        levelFilter={levelFilter}
        onLevelFilterChange={setLevelFilter}
        levelOptions={levelOptions}
        posFilter={posFilter}
        onPosFilterChange={setPosFilter}
        posOptions={posOptions}
        view={view}
        onViewChange={toggleView}
        onAddClick={() => setAddOpen(true)}
        onExportCsv={handleExportCsv}
        onExportAnki={handleExportAnki}
        onImportClick={() => setImportOpen(true)}
      />

      <TagFilterBar words={words} activeTags={tagFilter} onToggle={toggleTagFilter} />

      <BulkActionBar
        selectedWords={selectedWords}
        allTags={allTags}
        onBulkTag={handleBulkTag}
        onAiTag={handleAiTag}
        onBulkStatus={handleBulkStatus}
        onBulkDelete={handleBulkDelete}
      />

      {visible.length === 0 && (
        <p className="text-center text-sm text-black/40 py-12">
          {words.length === 0
            ? 'Chưa có từ nào. Bấm Thêm từ để bắt đầu.'
            : 'Chưa có từ nào khớp với bộ lọc.'}
        </p>
      )}

      {view === 'table' && shown.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-black/45 [&_th]:border-b [&_th]:border-black/10">
                <th className="w-10 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    aria-label="Chọn tất cả"
                  />
                </th>
                <th className="whitespace-nowrap px-3 py-2.5">
                  <button
                    className="flex items-center gap-1 whitespace-nowrap uppercase tracking-wide hover:text-black"
                    onClick={() => toggleSort('headword')}
                  >
                    Từ
                    {sortKey === 'headword' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                  </button>
                </th>
                <th className="whitespace-nowrap px-3 py-2.5">IPA</th>
                <th className="whitespace-nowrap px-3 py-2.5">
                  <button
                    className="flex items-center gap-1 whitespace-nowrap uppercase tracking-wide hover:text-black"
                    onClick={() => toggleSort('pos')}
                  >
                    Từ loại
                    {sortKey === 'pos' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                  </button>
                </th>
                <th className="whitespace-nowrap px-3 py-2.5">Nghĩa</th>
                <th className="whitespace-nowrap px-3 py-2.5">
                  <button
                    className="flex items-center gap-1 whitespace-nowrap uppercase tracking-wide hover:text-black"
                    onClick={() => toggleSort('level')}
                  >
                    Cấp độ
                    {sortKey === 'level' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                  </button>
                </th>
                <th className="whitespace-nowrap px-3 py-2.5">Thẻ</th>
                <th className="whitespace-nowrap px-3 py-2.5">
                  <button
                    className="flex items-center gap-1 whitespace-nowrap uppercase tracking-wide hover:text-black"
                    onClick={() => toggleSort('createdAt')}
                  >
                    Ngày thêm
                    {sortKey === 'createdAt' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                  </button>
                </th>
                <th className="whitespace-nowrap px-3 py-2.5">Audio</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((w) => (
                <Fragment key={w.id}>
                  <tr className="hover:bg-black/2 [&_td]:border-b [&_td]:border-black/5">
                    <td className="px-3 py-2.5 align-top">
                      <input
                        type="checkbox"
                        checked={selected.has(w.id)}
                        onChange={() => toggleSelect(w.id)}
                        aria-label={`Chọn từ ${w.headword}`}
                      />
                    </td>
                    <td className="px-3 py-2.5 align-top font-medium">{w.headword}</td>
                    <td className="px-3 py-2.5 align-top text-black/50"><Ipa value={w.ipa} lang={w.lang} /></td>
                    <td className="px-3 py-2.5 align-top text-black/50">{posGroup(w.pos)?.labelVi ?? w.pos ?? ''}</td>
                    <td className="px-3 py-2.5 align-top">{w.meaningVi ?? ''}</td>
                    <td className="px-3 py-2.5 align-top text-black/50">{w.level ?? ''}</td>
                    <td className="px-3 py-2.5 align-top">
                      <TagChips tags={w.tags} />
                    </td>
                    <td className="px-3 py-2.5 align-top whitespace-nowrap text-black/40">{formatWordDate(w.createdAt)}</td>
                    <td className="px-3 py-2.5 align-top">
                      <AudioButton text={w.headword} lang={w.lang} audioUrl={w.audioUrl} />
                    </td>
                    <td className="px-3 py-2.5 align-top text-right">
                      <WordRowActions
                        word={w}
                        expanded={expandedId === w.id}
                        onToggleDetail={() => setExpandedId(expandedId === w.id ? null : w.id)}
                        onEdit={() => setEditWord(w)}
                        onDelete={() => handleDelete(w.id, w.headword)}
                        className="justify-end"
                      />
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
                <span className="text-xs text-black/30">
                  {isDueAt(w.fsrsDueAt) ? DUE_LABEL : formatWordDate(w.createdAt)}
                </span>
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

      <ConfirmDialog
        open={confirming !== null}
        title={confirming?.title ?? ''}
        message={confirming?.message ?? ''}
        confirmLabel={confirming?.confirmLabel ?? ''}
        onConfirm={() => {
          confirming?.run()
          setConfirming(null)
        }}
        onCancel={() => setConfirming(null)}
      />

      <NoticeBar notice={notice} onDismiss={dismiss} />
    </div>
  )
}
