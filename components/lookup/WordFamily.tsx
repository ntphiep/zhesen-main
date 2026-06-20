import Link from 'next/link'
import { searchPath } from '@/lib/dictionary/entryId'
import type { LangCode } from '@/lib/content/types'

/** "Từ liên quan" = the grammatical word family (inflected forms of the headword). */
export function WordFamily({ headword, forms, lang }: { headword: string; forms: string[]; lang: LangCode }) {
  const others = forms.filter((f) => f.toLowerCase() !== headword.toLowerCase())
  if (others.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Từ liên quan</h2>
      <span className="text-xs text-black/40">Các dạng / biến thể của từ</span>
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full bg-black/10 px-3 py-1 text-sm font-medium text-black/80">{headword}</span>
        {others.map((f, i) => (
          <Link
            key={i}
            href={searchPath(lang, f)}
            className="rounded-full bg-black/5 px-3 py-1 text-sm text-black/70 hover:bg-black/10"
          >
            {f}
          </Link>
        ))}
      </div>
    </section>
  )
}
