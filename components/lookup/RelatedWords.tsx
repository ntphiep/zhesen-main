import Link from 'next/link'
import { searchPath } from '@/lib/dictionary/entryId'
import { classifyRelations, type ClassifiedRelations } from '@/lib/dictionary/relations'
import type { DictRelation } from '@/lib/dictionary/types'
import type { LangCode } from '@/lib/content/types'

const SECTIONS: { key: keyof ClassifiedRelations; label: string }[] = [
  { key: 'synonyms', label: 'Cận nghĩa' },
  { key: 'antonyms', label: 'Trái nghĩa' },
  { key: 'derived', label: 'Phái sinh' },
  { key: 'compounds', label: 'Từ ghép & cụm từ' },
  { key: 'related', label: 'Liên quan' },
]

/** Derived terms, compounds/phrases, synonyms and antonyms. The word family (forms)
 * lives in a separate "Từ liên quan" section (see WordFamily). */
export function RelatedWords({ relations, lang }: { relations: DictRelation[]; lang: LangCode }) {
  const c = classifyRelations(relations)
  const groups = SECTIONS.filter((s) => c[s.key].length > 0)
  if (groups.length === 0) return null
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Từ phái sinh &amp; cụm từ</h2>
      {groups.map((s) => (
        <div key={s.key} className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-black/40">{s.label}</span>
          <div className="flex flex-wrap gap-2">
            {c[s.key].map((text, i) => (
              <Link
                key={i}
                href={searchPath(lang, text)}
                className="rounded-full bg-black/5 px-3 py-1 text-sm text-black/70 hover:bg-black/10"
              >
                {text}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}
