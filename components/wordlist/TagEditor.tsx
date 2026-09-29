'use client'
import { useState } from 'react'
import { parseTagsInput, mergeTags, removeTag } from '@/lib/wordlist/tags'
import s from './Wordlist.module.css'

interface Props {
  tags: string[]
  onChange: (tags: string[]) => void
}

/** Chip-based tag editor: shows current tags with a remove (×) button each, plus an
 * input to add one or more new tags (comma-separated) on Enter. */
export function TagEditor({ tags, onChange }: Props) {
  const [input, setInput] = useState('')

  function addFromInput() {
    const toAdd = parseTagsInput(input)
    if (toAdd.length === 0) return
    onChange(mergeTags(tags, toAdd))
    setInput('')
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <span key={t} className={s.tag}>
            {t}
            <button
              type="button"
              onClick={() => onChange(removeTag(tags, t))}
              aria-label={`Bỏ thẻ ${t}`}
            >
              ×
            </button>
          </span>
        ))}
        {tags.length === 0 && <span className={s.note}>Chưa có thẻ</span>}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); addFromInput() }
          }}
          placeholder="Thẻ, cách nhau bằng dấu phẩy"
          className={`${s.field} flex-1 min-w-0`}
        />
        <button
          type="button"
          className={s.ghost}
          onClick={addFromInput}
        >
          Thêm thẻ
        </button>
      </div>
    </div>
  )
}
