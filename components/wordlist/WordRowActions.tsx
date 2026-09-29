import type { UserWord } from '@/lib/wordlist/types'
import s from './Wordlist.module.css'

/** Tag pills for one word. Renders nothing when the word has no tags. */
export function TagChips({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span key={tag} className={s.tag}>{tag}</span>
      ))}
    </div>
  )
}

/**
 * View, edit and delete for one saved word, shared by the table and the card grid so
 * the labels, the styling and the accessible names stay in step.
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
    <div className={`${s.acts} ${className}`.trim()}>
      <button
        className={s.act}
        onClick={onToggleDetail}
        aria-expanded={expanded}
        aria-label={`Xem chi tiết ${word.headword}`}
      >
        Xem
      </button>
      <button
        className={s.act}
        onClick={onEdit}
        aria-label={`Sửa từ ${word.headword}`}
      >
        Sửa
      </button>
      <button
        className={s.act}
        data-danger=""
        onClick={onDelete}
        aria-label={`Xóa từ ${word.headword}`}
      >
        Xóa
      </button>
    </div>
  )
}
