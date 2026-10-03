import Link from 'next/link'
import { posGroups, splitPos } from '@/lib/dictionary/pos'
import { hasWordClass } from '@/lib/theory/anchors'
import { wordClassPath } from '@/lib/theory/path'
import type { LangCode } from '@/lib/languages'

/**
 * The part of speech of a word, abbreviated. One word is several parts of speech more
 * often than not, so `value` may hold more than one (see `joinPos`) and all of them are
 * shown. `<abbr>` carries the Vietnamese expansion, which is what a reader who does not
 * know `prep.` gets on hover and what a screen reader announces.
 *
 * With `linkLang`, a class the theory pages document becomes a link to it. Only the word
 * page passes it: in a table every row would carry the same four links.
 */
export function PosTag({ value, linkLang, full = false, className = '' }: {
  value: string | null | undefined
  linkLang?: LangCode
  /** Spelled out in lower case ("danh từ, động từ"), for the word page's chips and rows. */
  full?: boolean
  className?: string
}) {
  const groups = posGroups(splitPos(value))
  if (groups.length === 0) return null
  if (full) {
    return <span className={className || undefined}>{groups.map((g) => g.labelVi.toLocaleLowerCase('vi')).join(', ')}</span>
  }
  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-1 ${className}`.trim()}>
      {groups.map((g, i) => {
        const documented = linkLang && hasWordClass(linkLang, g.key)
        const tag = <abbr title={g.labelVi} className="no-underline">{g.abbr}</abbr>
        return (
          <span key={g.key}>
            {i > 0 && <span aria-hidden="true" className="mr-1 opacity-50">·</span>}
            {documented
              ? <Link href={wordClassPath(linkLang, g.key)} className="hover:underline">{tag}</Link>
              : tag}
          </span>
        )
      })}
    </span>
  )
}
