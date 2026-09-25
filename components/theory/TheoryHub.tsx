import Link from 'next/link'
import { THEORY_PATH, theoryBlockPath } from '@/lib/theory/path'
import type { TheoryBlock, TheoryBlockKey } from '@/lib/theory/blocks'
import type { Language } from '@/lib/languages'

/** `/theory/[lang]`: the blocks this language has, in learning order. */
export function TheoryHub({ language, blocks, counts }: {
  language: Language
  blocks: TheoryBlock[]
  counts: Partial<Record<TheoryBlockKey, string>>
}) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href={THEORY_PATH} className="text-sm text-black/50 hover:underline">← Lý thuyết</Link>
      <div className="mt-3 flex items-baseline gap-3">
        <span className="text-xl font-medium text-black/70">{language.nativeName}</span>
        <h1 className="text-3xl font-bold">Lý thuyết {language.name}</h1>
      </div>

      <ol className="mt-8 flex flex-col gap-3">
        {blocks.map((b, i) => (
          <li key={b.key}>
            <Link
              href={theoryBlockPath(language.code, b.key)}
              className="flex items-start gap-4 rounded-2xl border border-black/10 px-5 py-4 transition hover:border-black/30 hover:bg-black/5"
            >
              <span className="mt-0.5 w-6 shrink-0 text-lg font-semibold text-black/45">{i + 1}</span>
              <span className="flex-1">
                <span className="flex flex-wrap items-baseline gap-x-3">
                  <span className="text-lg font-semibold">{b.titleVi}</span>
                  {counts[b.key] && <span className="text-sm text-black/45">{counts[b.key]}</span>}
                </span>
                <span className="mt-1 block text-sm text-black/60">{b.blurbVi}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </main>
  )
}
