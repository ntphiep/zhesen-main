import Link from 'next/link'
import { theoryLangPath } from '@/lib/theory/path'
import type { Language } from '@/lib/languages'

/** The frame every theory block shares: the way back to the hub, the title, one line
 *  saying what the page is for. */
export function BlockPage({ language, titleVi, leadVi, children }: {
  language: Language
  titleVi: string
  leadVi: string
  children: React.ReactNode
}) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href={theoryLangPath(language.code)} className="text-sm text-black/50 hover:underline">
        ← Lý thuyết {language.name}
      </Link>
      <h1 className="mt-3 text-3xl font-bold">{titleVi}</h1>
      <p className="mt-2 text-black/60">{leadVi}</p>
      {children}
    </main>
  )
}
