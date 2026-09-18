import Link from 'next/link'
import { entryPath } from '@/lib/dictionary/entryId'
import { LinkPending } from '@/components/ui/LinkPending'
import type { ContainingWord } from '@/lib/dictionary/types'
import type { LangCode } from '@/lib/languages'

const HEADING: Record<LangCode, string> = {
  zh: 'Từ ghép chứa từ này',
  en: 'Cụm từ chứa từ này',
  es: 'Cụm từ chứa từ này',
}

/**
 * Longer entries the word takes part in: 学 leads to 学生 and 大学, "give" to "give up"
 * and "give in". Neither the compounds nor the phrasal verbs are reachable from the
 * word's own page otherwise.
 */
export function ContainingWords({ words, lang }: { words: ContainingWord[]; lang: LangCode }) {
  if (words.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{HEADING[lang]}</h2>
      <ul className="flex flex-col gap-1">
        {words.map((w) => (
          <li key={w.id}>
            <Link
              href={entryPath(w.id)}
              className="flex flex-wrap items-baseline gap-x-2 rounded-lg px-2 py-1 hover:bg-black/5"
            >
              <span className="font-medium">{w.headword}</span>
              {w.glossVi && <span className="text-sm text-black/60">{w.glossVi}</span>}
              <LinkPending />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
