import Link from 'next/link'
import { grammarPointPath } from '@/lib/grammar/path'
import type { GrammarLevelGroup } from '@/lib/grammar/group'
import type { Language } from '@/lib/languages'

/** `/grammar/[lang]`: grammar points grouped by level, then by category_vi. */
export function GrammarPointList({ language, levels }: { language: Language; levels: GrammarLevelGroup[] }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/grammar" className="text-sm text-black/50 hover:underline">← Ngữ pháp</Link>
      <div className="mt-3 flex items-center gap-3">
        <span className="text-xl font-medium text-black/70">{language.nativeName}</span>
        <h1 className="text-3xl font-bold">Ngữ pháp {language.name}</h1>
      </div>

      {levels.length === 0 && <p className="mt-6 text-sm text-black/50">Chưa có điểm ngữ pháp nào.</p>}

      <div className="mt-8 flex flex-col gap-10">
        {levels.map((lvl) => (
          <section key={lvl.level}>
            <h2 className="mb-4 inline-block rounded-lg bg-black px-3 py-1 text-sm font-semibold text-white">{lvl.level}</h2>
            <div className="flex flex-col gap-6">
              {lvl.categories.map((cat) => (
                <div key={cat.categoryVi}>
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-black/40">{cat.categoryVi}</h3>
                  <div className="flex flex-col gap-2">
                    {cat.points.map((p) => (
                      <Link
                        key={p.id}
                        href={grammarPointPath(p.id)}
                        className="rounded-lg border border-black/10 px-4 py-3 hover:bg-black/5"
                      >
                        <div className="font-medium">{p.titleVi}</div>
                        <div className="mt-0.5 truncate text-sm text-black/50">{p.pattern}</div>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  )
}
