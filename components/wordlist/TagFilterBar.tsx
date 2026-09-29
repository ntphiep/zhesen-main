'use client'
import { tagCounts } from '@/lib/wordlist/tags'
import type { UserWord } from '@/lib/wordlist/types'
import s from './Wordlist.module.css'

interface Props {
  words: UserWord[]
  activeTags: ReadonlySet<string>
  onToggle: (tag: string) => void
}

/** Every tag in use, with how many words carry it; click to filter the list by it.
 *  Several chips can be active at once, and they narrow together. */
export function TagFilterBar({ words, activeTags, onToggle }: Props) {
  const counts = tagCounts(words)
  if (counts.length === 0) return null
  return (
    <div className={s.chips}>
      <span className={s.label}>Thẻ:</span>
      {counts.map(({ tag, count }) => {
        const on = activeTags.has(tag)
        return (
          <button
            key={tag}
            type="button"
            onClick={() => onToggle(tag)}
            aria-pressed={on}
            className={s.chip}
          >
            {tag} ({count})
          </button>
        )
      })}
    </div>
  )
}
