/** A CEFR or HSK level. An estimate is drawn as one, with "≈", a dashed border and a word
 *  for screen readers, because every Spanish level is Zhesen's estimate rather than a list. */
export function LevelBadge({ level, estimated = false, className = '' }: {
  level: string
  estimated?: boolean
  className?: string
}) {
  return (
    <span
      title={estimated ? 'Trình độ do Zhesen ước lượng' : undefined}
      className={`rounded-full border-[1.5px] border-current ${estimated ? 'border-dashed' : ''} ${className}`}
    >
      {estimated && <span aria-hidden>≈</span>}
      {level}
      {estimated && <span className="sr-only"> ước lượng</span>}
    </span>
  )
}
