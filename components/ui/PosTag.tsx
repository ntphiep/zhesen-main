import { posGroups, splitPos } from '@/lib/dictionary/pos'

/**
 * The part of speech of a word, abbreviated. One word is several parts of speech more
 * often than not, so `value` may hold more than one (see `joinPos`) and all of them are
 * shown. `<abbr>` carries the Vietnamese expansion, which is what a reader who does not
 * know `prep.` gets on hover and what a screen reader announces.
 */
export function PosTag({ value, className = '' }: { value: string | null | undefined; className?: string }) {
  const groups = posGroups(splitPos(value))
  if (groups.length === 0) return null
  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-1 ${className}`.trim()}>
      {groups.map((g, i) => (
        <span key={g.key}>
          {i > 0 && <span aria-hidden="true" className="mr-1 opacity-50">·</span>}
          <abbr title={g.labelVi} className="no-underline">{g.abbr}</abbr>
        </span>
      ))}
    </span>
  )
}
