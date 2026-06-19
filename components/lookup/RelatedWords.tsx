import Link from 'next/link'
import { relationLabel } from '@/lib/dictionary/labels'
import { searchPath } from '@/lib/dictionary/entryId'
import type { DictRelation } from '@/lib/dictionary/types'
import type { LangCode } from '@/lib/content/types'

const ORDER = ['synonym', 'antonym', 'derived', 'related']

export function RelatedWords({ relations, lang }: { relations: DictRelation[]; lang: LangCode }) {
  const groups: Record<string, string[]> = {}
  for (const r of relations) {
    if (!r.relatedText) continue
    ;(groups[r.relationType] ??= []).push(r.relatedText)
  }
  const keys = Object.keys(groups).sort((a, b) => {
    const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })
  if (keys.length === 0) return null
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Từ liên quan</h2>
      {keys.map((type) => (
        <div key={type} className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-black/40">{relationLabel(type)}</span>
          <div className="flex flex-wrap gap-2">
            {groups[type].map((text, i) => (
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
