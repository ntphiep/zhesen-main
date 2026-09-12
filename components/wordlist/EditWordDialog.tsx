'use client'
import { useEffect, useRef, useState } from 'react'
import type { UserWord, WordDraft, WordStatus } from '@/lib/wordlist/types'

interface Props {
  word: UserWord | null
  open: boolean
  onClose: () => void
  onSave: (id: string, patch: Partial<WordDraft>) => void | Promise<void>
}

function tagsToString(tags: string[]): string {
  return tags.join(', ')
}

function parseTags(raw: string): string[] {
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

export function EditWordDialog({ word, open, onClose, onSave }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  const [meaningVi, setMeaningVi] = useState('')
  const [meaningEn, setMeaningEn] = useState('')
  const [pos, setPos] = useState('')
  const [ipa, setIpa] = useState('')
  const [level, setLevel] = useState('')
  const [example, setExample] = useState('')
  const [exampleTranslation, setExampleTranslation] = useState('')
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState<WordStatus>('new')
  const [tagsRaw, setTagsRaw] = useState('')

  // Sync form state when word changes or dialog reopens (so stale edits don't persist
  // across open/close). Adjust state during render instead of in an effect, per
  // react.dev/learn/you-might-not-need-an-effect: track the (word, open) combination we
  // last synced from, and re-sync synchronously whenever it changes.
  const resetKey = open && word ? word.id : null
  const [prevResetKey, setPrevResetKey] = useState<string | null>(null)
  if (word && open && resetKey !== prevResetKey) {
    setPrevResetKey(resetKey)
    setMeaningVi(word.meaningVi ?? '')
    setMeaningEn(word.meaningEn ?? '')
    setPos(word.pos ?? '')
    setIpa(word.ipa ?? '')
    setLevel(word.level ?? '')
    setExample(word.example ?? '')
    setExampleTranslation(word.exampleTranslation ?? '')
    setNotes(word.notes ?? '')
    setStatus(word.status)
    setTagsRaw(tagsToString(word.tags))
  }

  // Drive open/close via prop. Guard against the dialog's current state: showModal()
  // throws if it is already open (e.g. React Strict Mode double-invokes the effect),
  // and the `open` attribute must NOT be set (that opens it non-modal, conflicting
  // with showModal()).
  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (open && !el.open) el.showModal()
    else if (!open && el.open) el.close()
  }, [open])

  async function handleSave() {
    if (!word) return
    const patch: Partial<WordDraft> = {}

    const newMeaningVi = meaningVi.trim() || null
    if (newMeaningVi !== word.meaningVi) patch.meaningVi = newMeaningVi

    const newMeaningEn = meaningEn.trim() || null
    if (newMeaningEn !== word.meaningEn) patch.meaningEn = newMeaningEn

    const newPos = pos.trim() || null
    if (newPos !== word.pos) patch.pos = newPos

    const newIpa = ipa.trim() || null
    if (newIpa !== word.ipa) patch.ipa = newIpa

    const newLevel = level.trim() || null
    if (newLevel !== word.level) patch.level = newLevel

    const newExample = example.trim() || null
    if (newExample !== word.example) patch.example = newExample

    const newExampleTranslation = exampleTranslation.trim() || null
    if (newExampleTranslation !== word.exampleTranslation) patch.exampleTranslation = newExampleTranslation

    const newNotes = notes.trim() || null
    if (newNotes !== word.notes) patch.notes = newNotes

    if (status !== word.status) patch.status = status

    const newTags = parseTags(tagsRaw)
    if (JSON.stringify(newTags) !== JSON.stringify(word.tags)) patch.tags = newTags

    await onSave(word.id, patch)
  }

  return (
    <dialog
      ref={dialogRef}
      className="rounded-xl bg-white shadow-xl p-0 w-full max-w-lg backdrop:bg-black/30"
      onClose={onClose}
    >
      <div className="flex items-center justify-between px-5 pt-4 pb-0">
        <h2 className="text-lg font-semibold">Chỉnh sửa từ</h2>
        <button
          className="text-black/40 hover:text-black/70 text-xl leading-none"
          onClick={onClose}
          aria-label="Đóng"
        >
          ×
        </button>
      </div>

      {word && (
        <div className="p-5 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-black/50">Nghĩa (VI)</span>
            <input
              type="text"
              value={meaningVi}
              onChange={(e) => setMeaningVi(e.target.value)}
              className="rounded-lg border border-black/15 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-black/50">Meaning (EN)</span>
            <input
              type="text"
              value={meaningEn}
              onChange={(e) => setMeaningEn(e.target.value)}
              className="rounded-lg border border-black/15 px-3 py-2 text-sm"
            />
          </label>
          <div className="flex gap-2">
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-xs text-black/50">Từ loại</span>
              <input
                type="text"
                value={pos}
                onChange={(e) => setPos(e.target.value)}
                className="rounded-lg border border-black/15 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-xs text-black/50">IPA</span>
              <input
                type="text"
                value={ipa}
                onChange={(e) => setIpa(e.target.value)}
                className="rounded-lg border border-black/15 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-black/50">Cấp độ</span>
            <input
              type="text"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="rounded-lg border border-black/15 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-black/50">Câu ví dụ</span>
            <input
              type="text"
              value={example}
              onChange={(e) => setExample(e.target.value)}
              className="rounded-lg border border-black/15 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-black/50">Dịch câu ví dụ</span>
            <input
              type="text"
              value={exampleTranslation}
              onChange={(e) => setExampleTranslation(e.target.value)}
              className="rounded-lg border border-black/15 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-black/50">Ghi chú</span>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rounded-lg border border-black/15 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-black/50">Trạng thái</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as WordStatus)}
              className="rounded-lg border border-black/15 px-3 py-2 text-sm bg-white"
            >
              <option value="new">Mới</option>
              <option value="learning">Đang học</option>
              <option value="known">Đã biết</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-black/50">Tags (phân cách bằng dấu phẩy)</span>
            <input
              type="text"
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              className="rounded-lg border border-black/15 px-3 py-2 text-sm"
            />
          </label>

          <div className="flex justify-end gap-2 mt-1">
            <button
              className="rounded-lg border border-black/15 px-4 py-2 text-sm"
              onClick={onClose}
            >
              Hủy
            </button>
            <button
              className="rounded-lg bg-black px-4 py-2 text-sm text-white"
              onClick={handleSave}
              aria-label="Lưu"
            >
              Lưu
            </button>
          </div>
        </div>
      )}
    </dialog>
  )
}
