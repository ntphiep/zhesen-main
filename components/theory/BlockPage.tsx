import Link from 'next/link'
import { theoryLangPath } from '@/lib/theory/path'
import { NextBlock } from './NextBlock'
import type { TheoryBlockKey } from '@/lib/theory/blocks'
import type { Language } from '@/lib/languages'

/** The frame every theory block shares: the way back to the hub, the title, one line
 *  saying what the page is for, and the way on to the next block. */
export function BlockPage({ language, block, titleVi, leadVi, children }: {
  language: Language
  block: TheoryBlockKey
  titleVi: string
  leadVi: string
  children: React.ReactNode
}) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      {/* No prefetch: the hub is one level up and the header already carries the section,
          so this only duplicated a speculative request that hung for 40s before aborting. */}
      <Link href={theoryLangPath(language.code)} prefetch={false} className="text-sm text-black/50 hover:underline">
        ← Lý thuyết {language.name}
      </Link>
      <h1 className="mt-3 text-3xl font-bold">{titleVi}</h1>
      <p className="mt-2 text-black/60">{leadVi}</p>
      {children}
      <NextBlock lang={language.code} block={block} />
    </main>
  )
}
