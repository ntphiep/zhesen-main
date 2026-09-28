'use client'
import { tagCounts } from '@/lib/wordlist/tags'
import type { UserWord } from '@/lib/wordlist/types'

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
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-black/55">Thẻ:</span>
      {counts.map(({ tag, count }) => {
        const on = activeTags.has(tag)
        return (
          <button
            key={tag}
            type="button"
            onClick={() => onToggle(tag)}
            aria-pressed={on}
            className={`rounded-full px-2.5 py-1 text-xs ${
              on ? 'bg-black text-white' : 'bg-black/5 text-black/70 hover:bg-black/10'
            }`}
          >
            {tag} ({count})
          </button>
        )
      })}
    </div>
  )
}
