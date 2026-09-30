import Link from 'next/link'
import { THEORY_PATH, theoryBlockPath } from '@/lib/theory/path'
import { PageHead } from './BlockPage'
import s from './Theory.module.css'
import type { TheoryBlock, TheoryBlockKey } from '@/lib/theory/blocks'
import type { Language } from '@/lib/languages'

/** `/theory/[lang]`: the blocks this language has, in learning order. */
export function TheoryHub({ language, blocks, counts }: {
  language: Language
  blocks: TheoryBlock[]
  counts: Partial<Record<TheoryBlockKey, string>>
}) {
  return (
    <main className={`${s.page} font-ui`} data-l={language.code}>
      <PageHead language={language} back={{ href: THEORY_PATH, label: 'Lý thuyết' }} title={`Lý thuyết ${language.name}`} strong />

      <div className={`${s.body} mx-auto max-w-page px-6`}>
        <ol className={s.blocks}>
          {blocks.map((b, i) => (
            <li key={b.key} data-reveal={Math.min(i, 3)}>
              <Link href={theoryBlockPath(language.code, b.key)} className={s.card}>
                <span className={s.step} aria-hidden="true">{i + 1}</span>
                <span className={s.h3}>{b.titleVi}</span>
                {counts[b.key] && <span className={s.note}>{counts[b.key]}</span>}
                <span className={s.small}>{b.blurbVi}</span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </main>
  )
}
