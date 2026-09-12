import type { UserWord } from '@/lib/wordlist/types'

/** Tag pills for one word. Renders nothing when the word has no tags. */
export function TagChips({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span key={tag} className="rounded-full bg-black/5 px-1.5 py-0.5 text-xs text-black/60">{tag}</span>
      ))}
    </div>
  )
}

/**
 * View / edit / delete for one saved word. The table and the card grid show the
 * same three buttons; they were written out twice, which is two places to keep
 * the labels, the styling and the accessible names in step.
 */
export function WordRowActions({
  word, expanded, onToggleDetail, onEdit, onDelete, className = '',
}: {
  word: UserWord
  expanded: boolean
  onToggleDetail: () => void
  onEdit: () => void
  onDelete: () => void
  className?: string
}) {
  return (
    <div className={`flex items-center gap-1 ${className}`.trim()}>
      <button
        className="rounded px-2 py-1 text-xs hover:bg-black/5"
        onClick={onToggleDetail}
        aria-expanded={expanded}
        aria-label={`Xem chi tiết ${word.headword}`}
      >
        Xem
      </button>
      <button
        className="rounded px-2 py-1 text-xs hover:bg-black/5"
        onClick={onEdit}
        aria-label={`Sửa từ ${word.headword}`}
      >
        Sửa
      </button>
      <button
        className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
        onClick={onDelete}
        aria-label={`Xóa từ ${word.headword}`}
      >
        Xóa
      </button>
    </div>
  )
}
