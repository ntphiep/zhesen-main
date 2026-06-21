'use client'
import { useState } from 'react'
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

// Some entries (Spanish verbs especially) carry dozens of idioms/compounds; cap each
// group so the page stays scannable, with a toggle to reveal the rest.
const CAP = 12

/** Derived terms, compounds/phrases, synonyms and antonyms. The word family (forms)
 * lives in a separate "Từ liên quan" section (see WordFamily). */
export function RelatedWords({ relations, lang }: { relations: DictRelation[]; lang: LangCode }) {
  const [expanded, setExpanded] = useState(false)
  const c = classifyRelations(relations)
  const groups = SECTIONS.filter((s) => c[s.key].length > 0)
  if (groups.length === 0) return null
  const hasOverflow = groups.some((s) => c[s.key].length > CAP)

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Từ phái sinh &amp; cụm từ</h2>
      {groups.map((s) => {
        const items = c[s.key]
        const shown = expanded ? items : items.slice(0, CAP)
        const hidden = items.length - shown.length
        return (
          <div key={s.key} className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-black/40">{s.label}</span>
            <div className="flex flex-wrap gap-2">
              {shown.map((text, i) => (
                <Link
                  key={i}
                  href={searchPath(lang, text)}
                  className="rounded-full bg-black/5 px-3 py-1 text-sm text-black/70 hover:bg-black/10"
                >
                  {text}
                </Link>
              ))}
              {!expanded && hidden > 0 && (
                <span className="rounded-full px-2 py-1 text-sm text-black/40">+{hidden}</span>
              )}
            </div>
          </div>
        )
      })}
      {hasOverflow && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-fit text-sm text-blue-700 hover:underline"
        >
          {expanded ? 'Thu gọn' : 'Xem thêm'}
        </button>
      )}
    </section>
  )
}
