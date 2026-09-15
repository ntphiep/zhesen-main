import Link from 'next/link'
import { searchPath } from '@/lib/dictionary/entryId'
import type { TermPreview } from '@/lib/dictionary/types'
import type { LangCode } from '@/lib/languages'

/**
 * "Dạng gốc": the way out of an inflected entry.
 *
 * A page for "adjourned" is a dead end without it -- the meaning lives on
 * "adjourn", and the only hint was an English sentence in the gloss. Shown right
 * under the headword because it is the first thing to do with such a page, not
 * an appendix.
 *
 * A lemma the dictionary does not hold yet is still named, in plain text: saying
 * "this is a form of adjourn" is worth more than silence, and a link to a page
 * that does not exist is worse than no link.
 */
export function LemmaLink({ lemma, preview, lang }: {
  lemma: string
  preview?: TermPreview
  lang: LangCode
}) {
  const gloss = preview?.glossVi || preview?.glossEn || null
  return (
    <p className="flex flex-wrap items-baseline gap-2 text-sm">
      <span className="text-black/50">Dạng gốc của</span>
      {preview ? (
        <Link href={searchPath(lang, lemma)} className="font-medium text-blue-700 hover:underline">
          {lemma}
        </Link>
      ) : (
        <span className="font-medium text-black/70">{lemma}</span>
      )}
      {gloss && <span className="text-black/50">{gloss}</span>}
    </p>
  )
}
