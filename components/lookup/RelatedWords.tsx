'use client'
import { useState } from 'react'
import Link from 'next/link'
import { searchPath } from '@/lib/dictionary/entryId'
import { classifyRelations, type ClassifiedRelations } from '@/lib/dictionary/relations'
import { posGroup } from '@/lib/dictionary/pos'
import type { DictRelation, TermPreview } from '@/lib/dictionary/types'
import type { LangCode } from '@/lib/languages'

const SECTIONS: { key: keyof ClassifiedRelations; label: string; hint: string }[] = [
  { key: 'synonyms', label: 'Cận nghĩa', hint: 'Dùng thay được trong một số ngữ cảnh' },
  { key: 'antonyms', label: 'Trái nghĩa', hint: 'Nghĩa ngược lại' },
  { key: 'derived', label: 'Phái sinh', hint: 'Từ tạo ra từ từ này' },
  { key: 'compounds', label: 'Từ ghép & cụm từ', hint: 'Cụm cố định chứa từ này' },
  // Wiktionary's "Related terms": words sharing an etymological root, not idioms.
  // "holy" lists halibut, halidom, hallow and holiday -- all from the same root,
  // none of them a phrase you would say. The old label promised idioms.
  { key: 'related', label: 'Cùng gốc từ', hint: 'Chung nguồn gốc, nghĩa nay có thể đã khác xa' },
]

// Some entries (Spanish verbs especially) carry dozens of idioms; cap each group
// so the page stays scannable, with a toggle to reveal the rest.
const CAP = 8

function Row({ text, preview, lang }: { text: string; preview?: TermPreview; lang: LangCode }) {
  const pos = posGroup(preview?.pos)
  return (
    <tr className="border-t border-black/5 align-baseline">
      <td className="px-2 py-1.5">
        <Link href={searchPath(lang, text)} className="font-medium hover:underline">{text}</Link>
      </td>
      <td className="px-2 py-1.5 whitespace-nowrap text-xs text-black/55">{pos?.labelVi ?? ''}</td>
      <td className="px-2 py-1.5 text-black/60">{preview?.glossVi || preview?.glossEn || ''}</td>
    </tr>
  )
}

/**
 * Synonyms, antonyms, derived terms and set phrases, each with its part of speech
 * and first meaning.
 *
 * These were thirty grey chips in five unexplained groups. A learner reading
 * "even, fluid, slick, downy, flat, frictionless, lanate, level, silken..." under
 * "synonyms" cannot use any of it: a synonym of one sense of a word is wrong in
 * another sense, and "lanate" is not a word to reach for. With the meaning beside
 * it the list becomes a choice rather than a wall. The word family (the forms of
 * the headword itself) lives in its own table, see WordFamily.
 */
export function RelatedWords({ relations, previews, lang }: {
  relations: DictRelation[]
  previews: Record<string, TermPreview>
  lang: LangCode
}) {
  const [expanded, setExpanded] = useState(false)
  const c = classifyRelations(relations)
  const groups = SECTIONS.filter((s) => c[s.key].length > 0)
  if (groups.length === 0) return null
  const hasOverflow = groups.some((s) => c[s.key].length > CAP)

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Từ phái sinh &amp; cụm từ</h2>
      {groups.map((s) => {
        const items = c[s.key]
        const shown = expanded ? items : items.slice(0, CAP)
        const hidden = items.length - shown.length
        return (
          <div key={s.key} className="flex flex-col gap-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-black/55">{s.label}</span>
              <span className="text-xs text-black/30">{s.hint}</span>
            </div>
            {/* A word the dictionary knows nothing about fills neither the part of
                speech nor the meaning column, and a ruled row holding one word and
                two blanks reads as broken data -- five of the eight rows under
                "holy" looked like that. Those become a line of chips instead, and
                the table is left to the rows that have something to put in it. */}
            {(() => {
              const described = shown.filter((t) => {
                const p = previews[t.toLowerCase()]
                return p?.glossVi || p?.glossEn || p?.pos
              })
              const bare = shown.filter((t) => !described.includes(t))
              return (
                <>
                  {described.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-sm">
                        <tbody>
                          {described.map((text) => (
                            <Row key={text} text={text} preview={previews[text.toLowerCase()]} lang={lang} />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {bare.length > 0 && (
                    <div className="flex flex-wrap gap-x-2 gap-y-1 px-2 text-sm">
                      {bare.map((text) => (
                        <Link
                          key={text}
                          href={searchPath(lang, text)}
                          className="rounded-full bg-black/5 px-2.5 py-0.5 text-black/70 hover:bg-black/10"
                        >
                          {text}
                        </Link>
                      ))}
                    </div>
                  )}
                </>
              )
            })()}
            {!expanded && hidden > 0 && (
              <span className="px-2 text-xs text-black/35">còn {hidden} từ nữa</span>
            )}
          </div>
        )
      })}
      {hasOverflow && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-fit text-sm text-blue-700 hover:underline"
        >
          {expanded ? 'Thu gọn' : 'Xem tất cả'}
        </button>
      )}
    </section>
  )
}
