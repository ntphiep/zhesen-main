import Link from 'next/link'
import { entryPath } from '@/lib/dictionary/entryId'
import { LANG_FLAGS, LANG_LABELS } from '@/lib/dictionary/labels'
import { posGroup } from '@/lib/dictionary/pos'
import { genderFromCode } from '@/lib/dictionary/gender'
import type { CrossLangSibling } from '@/lib/dictionary/types'
import type { LangCode } from '@/lib/languages'

const ORDER: LangCode[] = ['zh', 'es', 'en']

/**
 * "Từ này ở ngôn ngữ khác": what the word is in each of the other two languages.
 *
 * The panel used to show one flat list of up to twelve matches ordered by
 * language, so a word with several Spanish equivalents filled it and the Chinese
 * one never appeared -- the panel answered "in one other language" rather than
 * "in the others". The quota is now per language (see `lex.match_cross_language`),
 * and a Chinese equivalent carries its pinyin, without which it is unreadable to
 * someone who has not learnt the characters yet. A Spanish one carries its
 * gender, without which the learner cannot put an article in front of it.
 */
export function CrossLanguagePanel({ siblings }: { siblings: CrossLangSibling[] }) {
  if (siblings.length === 0) return null
  const byLang = ORDER.map((lang) => ({ lang, rows: siblings.filter((s) => s.lang === lang) }))
    .filter((g) => g.rows.length > 0)

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Từ này ở ngôn ngữ khác</h2>
      {byLang.map(({ lang, rows }) => (
        <div key={lang} className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-black/40">
            <span aria-hidden>{LANG_FLAGS[lang]}</span>
            {LANG_LABELS[lang]}
          </span>
          <ul className="flex flex-col">
            {rows.map((s) => {
              const pos = posGroup(s.pos)
              const gender = genderFromCode(s.gender)
              return (
                <li key={s.id}>
                  <Link
                    href={entryPath(s.id)}
                    className="flex flex-col rounded-lg px-2 py-1.5 hover:bg-black/5"
                  >
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">{s.headword}</span>
                      {s.reading && <span className="text-sm text-black/45">{s.reading}</span>}
                      {pos && <span className="text-xs text-black/35">{pos.labelVi}</span>}
                      {gender && <span className="text-xs text-black/35">{gender}</span>}
                    </span>
                    {(s.glossVi || s.glossEn) && (
                      <span className="text-sm text-black/55">{s.glossVi || s.glossEn}</span>
                    )}
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
