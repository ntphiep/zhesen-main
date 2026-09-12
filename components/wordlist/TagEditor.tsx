'use client'
import { useState } from 'react'
import { parseTagsInput, mergeTags, removeTag } from '@/lib/wordlist/tags'

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
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full bg-black/5 px-2 py-0.5 text-xs text-black/70"
          >
            {t}
            <button
              type="button"
              className="text-black/40 hover:text-black/80"
              onClick={() => onChange(removeTag(tags, t))}
              aria-label={`Bỏ thẻ ${t}`}
            >
              ×
            </button>
          </span>
        ))}
        {tags.length === 0 && <span className="text-xs text-black/30">Chưa có thẻ</span>}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); addFromInput() }
          }}
          placeholder="Thêm thẻ, phân cách bằng dấu phẩy"
          className="flex-1 rounded-lg border border-black/15 px-3 py-2 text-sm"
        />
        <button
          type="button"
          className="rounded-lg border border-black/15 px-3 py-2 text-sm hover:bg-black/5"
          onClick={addFromInput}
        >
          Thêm thẻ
        </button>
      </div>
    </div>
  )
}
