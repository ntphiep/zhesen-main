import Link from 'next/link'
import { wordClassPath } from '@/lib/theory/path'
import { BlockPage } from './BlockPage'
import s from './Theory.module.css'
import type { WordClass } from '@/lib/theory/types'
import type { Language } from '@/lib/languages'

/** `/theory/[lang]/word-class`: the classes a word can belong to. The tag on any entry
 *  in the dictionary points here. */
export function WordClassList({ language, classes }: { language: Language; classes: readonly WordClass[] }) {
  return (
    <BlockPage
      language={language}
      block="word-class"
      titleVi="Từ loại"
      leadVi="Mỗi từ thuộc một loại. Loại quyết định từ đứng ở đâu trong câu và đổi hình thế nào."
    >
      <div className={s.grid}>
        {classes.map((c, i) => (
          <Link key={c.key} href={wordClassPath(language.code, c.key)} className={`${s.card} flex flex-col gap-1.5`} data-accent="" data-reveal={Math.min(i, 3)}>
            <span className="flex items-baseline justify-between gap-3">
              <span className={s.h3}>{c.titleVi}</span>
              <span className={s.tag}>{c.abbr}</span>
            </span>
            <span className={s.small}>{c.oneLineVi}</span>
          </Link>
        ))}
      </div>
    </BlockPage>
  )
}
