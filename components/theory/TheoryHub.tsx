import { THEORY_PATH } from '@/lib/theory/path'
import { PageHead } from './BlockPage'
import { TheoryPath } from './TheoryReads'
import s from './Theory.module.css'
import type { TheoryBlock, TheoryBlockKey } from '@/lib/theory/blocks'
import type { TheoryPage } from '@/lib/theory/pages'
import type { Language } from '@/lib/languages'

/** `/theory/[lang]`: the blocks this language has, in learning order, with what this
 *  browser has read of each. */
export function TheoryHub({ language, blocks, counts, pages }: {
  language: Language
  blocks: TheoryBlock[]
  counts: Partial<Record<TheoryBlockKey, string>>
  pages: TheoryPage[]
}) {
  return (
    <main className={`${s.page} font-ui`} data-l={language.code}>
      <PageHead language={language} back={{ href: THEORY_PATH, label: 'Lý thuyết' }} title={`Lý thuyết ${language.name}`} strong />

      <div className={`${s.body} mx-auto max-w-page px-6`}>
        <TheoryPath lang={language.code} blocks={blocks} counts={counts} pages={pages} />
      </div>
    </main>
  )
}
