'use client'
import { useState } from 'react'
import { parseTagsInput } from '@/lib/wordlist/tags'
import { AiTagButton } from '@/components/wordlist/AiTagButton'
import { KNOWN_HINT, STATUS_OPTIONS, type UserWord, type WordStatus } from '@/lib/wordlist/types'
import s from './Wordlist.module.css'

interface Props {
  /** The selected rows themselves, not just how many: the assistant needs the
   *  word and its meaning to decide on a tag. */
  selectedWords: UserWord[]
  /** Every tag already used in the wordlist, so the assistant reuses them. */
  allTags: string[]
  onBulkTag: (tags: string[]) => void
  /** Keyed `lang:headword`. */
  onAiTag: (tagsByKey: Map<string, string[]>) => void
  onBulkStatus: (status: WordStatus) => void
  onBulkDelete: () => void
}

/** Toolbar shown once one or more rows are selected: tag, change status, or delete
 * every selected word at once. */
export function BulkActionBar({ selectedWords, allTags, onBulkTag, onAiTag, onBulkStatus, onBulkDelete }: Props) {
  const [tagInput, setTagInput] = useState('')
  const [bulkStatus, setBulkStatus] = useState<WordStatus>('learning')

  const selectedCount = selectedWords.length
  if (selectedCount === 0) return null

  function applyTags() {
    const tags = parseTagsInput(tagInput)
    if (tags.length === 0) return
    onBulkTag(tags)
    setTagInput('')
  }

  return (
    <div className={s.bulk}>
      <span className={s.count}>{selectedCount} từ đã chọn</span>

      <input
        type="text"
        value={tagInput}
        onChange={(e) => setTagInput(e.target.value)}
        // The bar is not a form, so Enter would otherwise do nothing in a box that
        // reads as one.
        onKeyDown={(e) => { if (e.key === 'Enter') applyTags() }}
        placeholder="Thẻ, cách nhau bằng dấu phẩy"
        className={s.field}
      />
      <button
        type="button"
        className={s.ghost}
        onClick={applyTags}
      >
        Gắn thẻ
      </button>
      <AiTagButton words={selectedWords} existingTags={allTags} onTagged={onAiTag} />

      <select
        value={bulkStatus}
        onChange={(e) => setBulkStatus(e.target.value as WordStatus)}
        className={s.field}
        aria-label="Trạng thái cho các từ đã chọn"
      >
        {STATUS_OPTIONS.map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
      <button
        type="button"
        className={s.ghost}
        onClick={() => onBulkStatus(bulkStatus)}
      >
        Đổi trạng thái
      </button>
      {bulkStatus === 'known' && <span className={s.note}>{KNOWN_HINT}</span>}

      <button
        type="button"
        className={`${s.danger} ml-auto`}
        onClick={onBulkDelete}
      >
        Xóa đã chọn ({selectedCount})
      </button>
    </div>
  )
}
