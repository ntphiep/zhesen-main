import Link from 'next/link'
import { entryPath } from '@/lib/dictionary/entryId'
import { LinkPending } from '@/components/ui/LinkPending'
import { LANG_LABELS } from '@/lib/dictionary/labels'
import { PosTag } from '@/components/ui/PosTag'
import { genderFromCode } from '@/lib/dictionary/gender'
import type { CrossLangSibling } from '@/lib/dictionary/types'
import type { LangCode } from '@/lib/languages'

const ORDER: LangCode[] = ['zh', 'es', 'en']

/**
 * "Ngôn ngữ khác": what the word is in each of the other two languages, as a rail card.
 *
 * The quota is per language (see `lex.match_cross_language`), or a word with several
 * Spanish equivalents fills the panel and the Chinese one never appears. A Chinese row
 * carries its pinyin and a Spanish one its gender, without which neither can be used.
 */
export function CrossLanguagePanel({ siblings }: { siblings: CrossLangSibling[] }) {
  if (siblings.length === 0) return null
  const byLang = ORDER.map((lang) => ({ lang, rows: siblings.filter((s) => s.lang === lang) }))
    .filter((g) => g.rows.length > 0)

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-black/10 p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-black/55">Ngôn ngữ khác</h2>
      {byLang.map(({ lang, rows }) => (
        <div key={lang} className="flex flex-col">
          <span className="text-xs text-black/45">{LANG_LABELS[lang]}</span>
          <ul className="flex flex-col">
            {rows.map((s) => {
              const gender = genderFromCode(s.gender)
              return (
                <li key={s.id}>
                  <Link
                    href={entryPath(s.id)}
                    className="-mx-2 flex flex-wrap items-baseline gap-x-2 rounded-lg px-2 py-0.5 hover:bg-black/5"
                  >
                    <span className="font-medium">{s.headword}</span>
                    {s.reading && <span className="text-sm text-black/45">{s.reading}</span>}
                    <PosTag value={s.pos} className="text-xs text-black/35" />
                    {gender && <span className="text-xs text-black/35">{gender}</span>}
                    {(s.glossVi || s.glossEn) && (
                      <span className="text-sm text-black/55">{s.glossVi || s.glossEn}</span>
                    )}
                    <LinkPending />
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </section>
  )
}
