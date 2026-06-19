import Link from 'next/link'
import { entryPath } from '@/lib/dictionary/entryId'
import { LANG_FLAGS, LANG_LABELS } from '@/lib/dictionary/labels'
import type { CrossLangSibling } from '@/lib/dictionary/types'

export function CrossLanguagePanel({ siblings }: { siblings: CrossLangSibling[] }) {
  if (siblings.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Từ này ở ngôn ngữ khác</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {siblings.map((s) => (
          <Link
            key={s.id}
            href={entryPath(s.id)}
            className="flex items-center gap-3 rounded-lg border border-black/10 px-4 py-3 hover:bg-black/5"
          >
            <span className="text-xl">{LANG_FLAGS[s.lang]}</span>
            <div className="flex flex-col">
              <span className="font-medium">{s.headword}</span>
              {s.glossVi && <span className="text-sm text-black/50">{s.glossVi}</span>}
              <span className="text-xs text-black/30">{LANG_LABELS[s.lang]}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
