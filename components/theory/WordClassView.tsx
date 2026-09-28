import Link from 'next/link'
import { theoryBlockPath } from '@/lib/theory/path'
import { GrammarLinks } from '@/components/lookup/GrammarLinks'
import { MistakeList } from './MistakeList'
import type { WordClass } from '@/lib/theory/types'
import type { GrammarPoint } from '@/lib/grammar/types'
import type { Language } from '@/lib/languages'

/** `/theory/[lang]/word-class/[key]`: one class, what it does, the forms it takes, its
 *  subtypes, and the grammar points that govern it. */
export function WordClassView({ language, wordClass: c, grammar }: {
  language: Language
  wordClass: WordClass
  grammar: GrammarPoint[]
}) {
  return (
    <main className="mx-auto flex max-w-page flex-col gap-8 px-6 py-10">
      <div>
        <Link
          href={theoryBlockPath(language.code, 'word-class')}
          className="text-sm text-black/55 hover:underline"
        >
          ← Từ loại
        </Link>
        <div className="mt-3 flex items-baseline gap-3">
          <h1 className="text-3xl font-bold">{c.titleVi}</h1>
          <span className="text-lg text-black/55">{c.abbr}</span>
        </div>
        <p className="mt-2 text-black/70">{c.oneLineVi}</p>
      </div>

      <section className="rounded-2xl bg-black/5 px-5 py-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-black/55">Vai trò trong câu</h2>
        <p className="mt-1 text-black/80">{c.roleVi}</p>
      </section>

      {c.forms.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">Biến đổi hình thái</h2>
          {c.forms.map((f) => (
            <div key={f.titleVi}>
              <h3 className="font-medium">{f.titleVi}</h3>
              <p className="mt-0.5 text-sm text-black/70">{f.explainVi}</p>
              <p className="mt-1 text-sm text-black/55">{f.examples.join(' · ')}</p>
            </div>
          ))}
        </section>
      )}

      {c.subtypes.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">Các loại nhỏ</h2>
          {c.subtypes.map((s) => (
            <div key={s.titleVi} className="rounded-2xl border border-black/10 px-5 py-4">
              <h3 className="font-medium">{s.titleVi}</h3>
              <p className="mt-0.5 text-sm text-black/70">{s.explainVi}</p>
              <p className="mt-1 text-sm text-black/55">{s.examples.join(' · ')}</p>
            </div>
          ))}
        </section>
      )}

      <MistakeList mistakes={c.mistakes} />

      <GrammarLinks points={grammar} />
    </main>
  )
}
