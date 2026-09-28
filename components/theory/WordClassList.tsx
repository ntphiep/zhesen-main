import Link from 'next/link'
import { wordClassPath } from '@/lib/theory/path'
import { BlockPage } from './BlockPage'
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
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {classes.map((c) => (
          <Link
            key={c.key}
            href={wordClassPath(language.code, c.key)}
            className="rounded-2xl border border-black/10 px-5 py-4 transition hover:border-black/30 hover:bg-black/5"
          >
            <div className="flex items-baseline gap-2">
              <span className="font-semibold">{c.titleVi}</span>
              <span className="text-sm text-black/55">{c.abbr}</span>
            </div>
            <p className="mt-1 text-sm text-black/60">{c.oneLineVi}</p>
          </Link>
        ))}
      </div>
    </BlockPage>
  )
}
