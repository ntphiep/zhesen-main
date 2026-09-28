import Link from 'next/link'
import { entryPath } from '@/lib/dictionary/entryId'
import { LinkPending } from '@/components/ui/LinkPending'
import { LANG_LABELS } from '@/lib/dictionary/labels'
import { genderFromCode } from '@/lib/dictionary/gender'
import { SectionLabel } from './WordParts'
import type { CrossLangSibling } from '@/lib/dictionary/types'
import type { LangCode } from '@/lib/languages'

const ORDER: LangCode[] = ['zh', 'es', 'en']

/**
 * "Ngôn ngữ khác": what the word is in each of the other two languages.
 *
 * The quota is per language (see `lex.match_cross_language`), or a word with several
 * Spanish equivalents fills the panel and the Chinese one never appears. A Chinese row
 * carries its pinyin and a Spanish one its gender, without which neither can be used.
 */
export function CrossLanguagePanel({ siblings, className = '' }: {
  siblings: CrossLangSibling[]
  /** The card around it, which each layout draws its own way. */
  className?: string
}) {
  if (siblings.length === 0) return null
  const byLang = ORDER.map((lang) => ({ lang, rows: siblings.filter((s) => s.lang === lang) }))
    .filter((g) => g.rows.length > 0)

  return (
    <section className={`flex flex-col gap-4 ${className}`}>
      <SectionLabel>Ngôn ngữ khác</SectionLabel>
      {byLang.map(({ lang, rows }, i) => (
        <div key={lang} className={`flex flex-col gap-2 ${i > 0 ? 'border-t border-black/[0.06] pt-4' : ''}`}>
          <span className="text-xs text-black/55">{LANG_LABELS[lang]}</span>
          <ul className="flex flex-col gap-1">
            {rows.map((s) => {
              const gender = genderFromCode(s.gender)
              const gloss = s.glossVi || s.glossEn
              return (
                <li key={s.id}>
                  <Link href={entryPath(s.id)} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-1 hover:bg-black/[0.04]">
                    {lang === 'zh' && <span className="shrink-0 text-[28px] leading-none text-blue-700">{s.headword}</span>}
                    <span className="flex min-w-0 flex-col">
                      {lang === 'zh'
                        ? s.reading && <span className="text-xs text-black/55">{s.reading}</span>
                        : (
                          <span className="flex flex-wrap items-baseline gap-x-2">
                            <span className="text-lg font-semibold text-blue-700">{s.headword}</span>
                            {gender && <span className="text-xs text-black/55">{gender}</span>}
                          </span>
                        )}
                      {gloss && <span className="text-sm">{gloss}</span>}
                    </span>
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
