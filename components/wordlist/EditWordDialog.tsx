'use client'
import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { TagEditor } from './TagEditor'
import { STATUS_OPTIONS, type UserWord, type WordDraft, type WordStatus } from '@/lib/wordlist/types'

interface Props {
  word: UserWord | null
  open: boolean
  onClose: () => void
  onSave: (id: string, patch: Partial<WordDraft>) => void | Promise<void>
}

export function EditWordDialog({ word, open, onClose, onSave }: Props) {

  const [meaningVi, setMeaningVi] = useState('')
  const [meaningEn, setMeaningEn] = useState('')
  const [pos, setPos] = useState('')
  const [ipa, setIpa] = useState('')
  const [level, setLevel] = useState('')
  const [example, setExample] = useState('')
  const [exampleTranslation, setExampleTranslation] = useState('')
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState<WordStatus>('new')
  const [tags, setTags] = useState<string[]>([])

  // Sync form state when the word changes or the dialog reopens, so a draft the
  // user cancelled does not come back. Adjust state during render instead of in
  // an effect, per react.dev/learn/you-might-not-need-an-effect: track the
  // (word, open) combination last synced from and re-sync when it changes.
  //
  // `resetKey` must change on close too: closing sets `word` to null
  // (WordlistClient passes `editWord`), so a guard of `word && open && ...`
  // would skip the sync on close, reopening the same word would then match the
  // stale key, and the cancelled draft would stay in the fields.
  const resetKey = open && word ? word.id : null
  const [prevResetKey, setPrevResetKey] = useState<string | null>(null)
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey)
    if (word && open) {
      setMeaningVi(word.meaningVi ?? '')
      setMeaningEn(word.meaningEn ?? '')
      setPos(word.pos ?? '')
      setIpa(word.ipa ?? '')
      setLevel(word.level ?? '')
      setExample(word.example ?? '')
      setExampleTranslation(word.exampleTranslation ?? '')
      setNotes(word.notes ?? '')
      setStatus(word.status)
      setTags(word.tags)
    }
  }

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

    if (JSON.stringify(tags) !== JSON.stringify(word.tags)) patch.tags = tags

    // Nothing changed. This dialog is the only place a note or an example
    // translation can be read, so opening a word to look at it and then pressing
    // Lưu out of habit is ordinary. An empty PATCH either fails and reports
    // "Không lưu được thay đổi" for a save with nothing to save, or succeeds and
    // lets the updated_at trigger record when the word was last LOOKED AT rather
    // than last edited.
    if (Object.keys(patch).length === 0) { onClose(); return }

    await onSave(word.id, patch)
  }

  return (
    <Modal open={open} onClose={onClose} title="Chỉnh sửa từ" titleId="edit-word-title" widthClass="max-w-lg">

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
              {STATUS_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-black/50">Thẻ phân loại</span>
            <TagEditor tags={tags} onChange={setTags} />
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
    </Modal>
  )
}
