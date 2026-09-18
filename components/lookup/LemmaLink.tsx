import Link from 'next/link'
import { searchPath } from '@/lib/dictionary/entryId'
import type { TermPreview } from '@/lib/dictionary/types'
import type { LangCode } from '@/lib/languages'

/**
 * "Dạng gốc": the way out of an inflected entry, under the headword because it is
 * the first thing to do with such a page. A lemma the dictionary does not hold yet
 * is still named, in plain text: a link to a page that does not exist is worse.
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
