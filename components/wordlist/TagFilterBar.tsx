'use client'
import { tagCounts } from '@/lib/wordlist/tags'
import type { UserWord } from '@/lib/wordlist/types'

interface Props {
  words: UserWord[]
  activeTag: string | null
  onToggle: (tag: string) => void
}

/** Every tag in use, with how many words carry it; click to filter the list by it. */
export function TagFilterBar({ words, activeTag, onToggle }: Props) {
  const counts = tagCounts(words)
  if (counts.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-black/40">Thẻ:</span>
      {counts.map(({ tag, count }) => (
        <button
          key={tag}
          type="button"
          onClick={() => onToggle(tag)}
          aria-pressed={activeTag === tag}
          className={`rounded-full px-2.5 py-1 text-xs ${
            activeTag === tag ? 'bg-black text-white' : 'bg-black/5 text-black/70 hover:bg-black/10'
          }`}
        >
          {tag} ({count})
        </button>
      ))}
    </div>
  )
}
