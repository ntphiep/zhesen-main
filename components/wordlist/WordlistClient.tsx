'use client'
import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { addWord, addWords, listWords, updateWord, updateWordsStatus, deleteWord, deleteWords } from '@/lib/wordlist/store'
import { mergeTags, tagCounts } from '@/lib/wordlist/tags'
import { formatWordDate, isDueAt, DUE_LABEL } from '@/lib/wordlist/format'
import { PosTag } from '@/components/ui/PosTag'
import { wordsToCsv, wordsToAnkiTsv } from '@/lib/wordlist/csv'
import { downloadTextFile } from '@/lib/wordlist/download'
import { useWordlistFilters } from '@/lib/hooks/useWordlistFilters'
import { useWordlistColumns } from '@/lib/hooks/useWordlistColumns'
import { usePagedList } from '@/lib/hooks/usePagedList'
import { WordlistToolbar } from '@/components/wordlist/WordlistToolbar'
import { WordTable } from '@/components/wordlist/WordTable'
import { ColumnMenu } from '@/components/wordlist/ColumnMenu'
import { Pagination } from '@/components/wordlist/Pagination'
import { TagFilterBar } from '@/components/wordlist/TagFilterBar'
import { BulkActionBar } from '@/components/wordlist/BulkActionBar'
import { AddWordDialog } from '@/components/wordlist/AddWordDialog'
import { EditWordDialog } from '@/components/wordlist/EditWordDialog'
import { ImportCsvDialog } from '@/components/wordlist/ImportCsvDialog'
import { WordDetail } from '@/components/wordlist/WordDetail'
import { TagChips, WordRowActions } from '@/components/wordlist/WordRowActions'
import { AudioButton, SourceLink } from '@/components/ui/AudioButton'
import { STATUS_LABELS, type UserWord, type WordDraft, type WordStatus } from '@/lib/wordlist/types'
import { Ipa } from '@/components/ui/Ipa'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { NoticeBar, useNotice } from '@/components/ui/Notice'
import { LANGUAGES } from '@/lib/languages'
import s from './Wordlist.module.css'

const LANG_NAME = new Map(LANGUAGES.map((l) => [l.code, l.name]))

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

  const {
    prefs, layout, columns, allColumns, toggleColumn, togglePin, move: moveColumn,
    resize: resizeColumn, reset: resetColumns,
  } = useWordlistColumns()

  // tagFilter is a Set and must be spelled out: interpolated it gives "[object Set]"
  // for every combination, so the reader would stay on page 7 of a filter that now
  // returns one page.
  const filterSignature =
    `${query}|${langFilter}|${statusFilter}|${reviewFilter}|${levelFilter}|${posFilter}|${[...tagFilter].join(',')}|${sortKey}|${sortDir}`
  // 400+ rows for a real learner, each mounting an audio button and a row-actions group.
  // Selection and export still use the full filtered set, not the page on screen.
  const paged = usePagedList(visible, filterSignature)
  const shown = paged.items

  // Select-all takes the whole filtered list, not the page: the action that follows it
  // is meant for everything the filter matched, and a learner who filtered by a tag and
  // pressed it expects all of those rows tagged, not the first fifty.
  const allVisibleIds = visible.map((w) => w.id)
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selected.has(id))
  // Bulk actions act only on what the filter shows: a selected row the filter hid
  // would otherwise be deleted unseen. The selection itself is kept for when it returns.
  const selectedWords = visible.filter((w) => selected.has(w.id))
  const selectedIds = selectedWords.map((w) => w.id)

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
      notify('Chưa thêm được từ. Thử lại.')
    }
  }

  // The preview dedupes against the list as of file-open, so a word saved in another
  // tab since then returns as a skip, which must be reported rather than swallowed.
  async function handleImport(drafts: WordDraft[]) {
    try {
      const added = await addWords(supabase, drafts)
      const skipped = drafts.length - added.length
      if (skipped > 0) notify(`Bỏ qua ${skipped} từ đã có trong sổ tay.`, 'info')
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
      message: `Xóa "${headword}" khỏi sổ tay? Tiến độ ôn của từ này cũng mất.`,
      confirmLabel: 'Xóa',
      run: () => void deleteOne(id),
    })
  }

  async function deleteOne(id: string) {
    // Snapshot outside the updater: React may call an updater more than once, and the
    // catch below needs the pre-delete list.
    const snapshot = words
    const wasSelected = selected.has(id)
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
      if (wasSelected) setSelected((prev) => new Set(prev).add(id))
      notify('Chưa xóa được từ. Thử lại.')
    }
  }

  function handleBulkDelete() {
    const ids = selectedIds
    if (ids.length === 0) return
    setConfirming({
      title: 'Xóa nhiều từ',
      message: `Xóa ${ids.length} từ đã chọn khỏi sổ tay? Tiến độ ôn của các từ này cũng mất.`,
      confirmLabel: `Xóa ${ids.length} từ`,
      run: () => void deleteMany(ids),
    })
  }

  async function deleteMany(ids: string[]) {
    const snapshot = words
    setWords((prev) => prev.filter((w) => !ids.includes(w.id)))
    // Only the deleted ids leave the selection: the hidden ones wait for the filter to clear.
    setSelected((prev) => new Set([...prev].filter((id) => !ids.includes(id))))
    try {
      await deleteWords(supabase, ids)
    } catch {
      setWords(snapshot)
      setSelected((prev) => new Set([...prev, ...ids]))
      notify('Chưa xóa được từ. Thử lại.')
    }
  }

  // One request per row: a flat bulk UPDATE would write the same tag array over every
  // row, and an upsert cannot carry a partial row past the table's NOT NULL columns.
  async function applyTags(tagsFor: (w: UserWord) => string[]) {
    const ids = selectedIds
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
    if (lost.size > 0) notify(`Chưa gắn thẻ được cho ${lost.size} từ. Thử lại.`)
  }

  const handleBulkTag = (tagsToAdd: string[]) => applyTags(() => tagsToAdd)

  // Per word, so a word the assistant skipped keeps its own tags. The key carries the
  // language because "no" exists in both English and Spanish.
  const handleAiTag = (tagsByKey: Map<string, string[]>) =>
    applyTags((w) => tagsByKey.get(`${w.lang}:${w.headword}`) ?? [])

  async function handleBulkStatus(status: WordStatus) {
    const ids = selectedIds
    if (ids.length === 0) return
    const snapshot = words
    setWords((prev) => prev.map((w) => (ids.includes(w.id) ? { ...w, status } : w)))
    try {
      await updateWordsStatus(supabase, ids, status)
    } catch {
      setWords(snapshot)
      notify('Chưa đổi được trạng thái. Thử lại.')
    }
  }

  /** False when the change did not reach the database; the learner is told here. */
  async function handleSave(id: string, patch: Partial<WordDraft>): Promise<boolean> {
    const original = words.find((w) => w.id === id)
    if (!original) return false
    setEditWord(null)
    // The dialog reports only changed fields, so an untouched save sends an empty
    // patch, and PostgREST refuses an empty update.
    if (Object.keys(patch).length === 0) return true
    setWords((prev) => prev.map((w) => (w.id === id ? { ...w, ...patch } : w)))
    try {
      const updated = await updateWord(supabase, id, patch)
      setWords((prev) => prev.map((w) => (w.id === id ? updated : w)))
      return true
    } catch {
      setWords((prev) => prev.map((w) => (w.id === id ? original : w)))
      notify('Chưa lưu được. Thử lại.')
      return false
    }
  }

  /** The assistant's mnemonic appended to the word's own notes, once. */
  async function handleSaveNote(w: UserWord, note: string): Promise<boolean> {
    if (w.notes?.includes(note)) return true
    return handleSave(w.id, { notes: w.notes ? `${w.notes}\n${note}` : note })
  }

  function handleExportCsv() {
    downloadTextFile('wordlist.csv', wordsToCsv(visible), 'text/csv;charset=utf-8')
  }

  function handleExportAnki() {
    downloadTextFile('wordlist-anki.tsv', wordsToAnkiTsv(visible), 'text/tab-separated-values;charset=utf-8')
  }

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
        columnControls={
          <ColumnMenu
            prefs={prefs}
            columns={allColumns}
            onToggleColumn={toggleColumn}
            onTogglePin={togglePin}
            onMove={moveColumn}
            onReset={resetColumns}
          />
        }
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
        <p className={s.empty}>
          {words.length === 0
            ? 'Chưa có từ. Tra một từ để lưu.'
            : 'Không có từ nào khớp bộ lọc. Đổi bộ lọc.'}
        </p>
      )}

      {view === 'table' && shown.length > 0 && (
        <WordTable
          words={shown}
          columns={columns}
          pinned={prefs.pinned}
          widths={layout.widths}
          onResizeColumn={resizeColumn}
          onMoveColumn={moveColumn}
          sortKey={sortKey}
          sortDir={sortDir}
          onToggleSort={toggleSort}
          // The header box reads its size, which must not count rows the filter hid.
          selected={new Set(selectedIds)}
          allSelected={allSelected}
          onToggleSelectAll={toggleSelectAll}
          onToggleSelect={toggleSelect}
          expandedId={expandedId}
          onToggleDetail={(id) => setExpandedId(expandedId === id ? null : id)}
          onSaveNote={handleSaveNote}
          onEdit={setEditWord}
          onDelete={handleDelete}
        />
      )}

      {view === 'card' && shown.length > 0 && (
        <ul className={s.cards}>
          {shown.map((w) => {
            const due = isDueAt(w.fsrsDueAt)
            return (
              <li key={w.id} className={s.card} data-l={w.lang} data-on={selected.has(w.id) || undefined}>
                <div className={s.meta}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selected.has(w.id)}
                      onChange={() => toggleSelect(w.id)}
                      aria-label={`Chọn từ ${w.headword}`}
                    />
                    {LANG_NAME.get(w.lang) ?? w.lang}
                  </label>
                  <span className="inline-flex items-center gap-1">
                    {w.level && <span className={s.level}>{w.level}</span>}
                    <AudioButton text={w.headword} lang={w.lang} audioUrl={w.audioUrl} />
                    <SourceLink url={w.audioUrl} />
                  </span>
                </div>

                <span className={s.hw} data-l={w.lang} lang={w.lang}>{w.headword}</span>
                <div className={s.line}>
                  {/* Chinese keeps its pinyin in `ipa` unless the entry gave a separate reading. */}
                  <Ipa value={w.reading || w.ipa} lang={w.lang} />
                  <PosTag value={w.pos} />
                </div>
                {w.meaningVi && <p className={s.mean}>{w.meaningVi}</p>}
                {w.example && <p className={s.ex}>{w.example}</p>}
                <TagChips tags={w.tags} />

                <div className={s.foot}>
                  <span className="inline-flex items-center gap-3">
                    <span className={s.status} data-s={w.status}>{STATUS_LABELS[w.status]}</span>
                    <span className={s.when} data-due={due || undefined}>
                      {due ? DUE_LABEL : formatWordDate(w.createdAt)}
                    </span>
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
                  <div className={s.cardDetail}>
                    <WordDetail word={w} onSaveNote={(note) => handleSaveNote(w, note)} />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {visible.length > 0 && (
        <Pagination
          page={paged.page}
          pageCount={paged.pageCount}
          pageSize={paged.pageSize}
          total={paged.total}
          from={paged.from}
          to={paged.to}
          onPageChange={paged.setPage}
          onPageSizeChange={paged.setPageSize}
        />
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
        onSave={async (id, patch) => { await handleSave(id, patch) }}
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
