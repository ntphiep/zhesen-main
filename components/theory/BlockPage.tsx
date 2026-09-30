import Link from 'next/link'
import { theoryLangPath } from '@/lib/theory/path'
import { NextBlock } from './NextBlock'
import { ArrowLeft } from './Glyphs'
import s from './Theory.module.css'
import type { TheoryBlockKey } from '@/lib/theory/blocks'
import type { Language } from '@/lib/languages'

/** The head every theory page shares: the way back, the page's language, the title and
 *  one line saying what the page is for, on the language's pastel band. */
export function PageHead({ language, back, title, lede, strong, children }: {
  language: Language
  back: { href: string; label: string; prefetch?: false }
  title: React.ReactNode
  lede?: React.ReactNode
  /** The hub's deeper band; a block page keeps the light one for reading. */
  strong?: boolean
  children?: React.ReactNode
}) {
  return (
    <div className={s.band} data-strong={strong || undefined}>
      <header className={`${s.head} mx-auto max-w-page px-6`}>
        <Link href={back.href} prefetch={back.prefetch} className={s.crumb}>
          <ArrowLeft /><span>{back.label}</span>
        </Link>
        <p className={s.eyebrow}>
          <span className={s.hw} lang={language.code}>{language.nativeName}</span>
          <span>{language.name}</span>
        </p>
        <h1 className={s.title}>{title}</h1>
        {lede && <p className={s.lede}>{lede}</p>}
        {children}
      </header>
    </div>
  )
}

/** The frame every theory block shares: the head, the block, and the way on to the next
 *  block. A block with a table of contents passes it as `toc`, which sits beside the
 *  block on a wide screen. */
export function BlockPage({ language, block, titleVi, leadVi, toc, children }: {
  language: Language
  block: TheoryBlockKey
  titleVi: string
  leadVi: string
  toc?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <main className={`${s.page} font-ui`} data-l={language.code}>
      {/* No prefetch: the hub is one level up and the header already carries the section,
          so this only duplicated a speculative request that hung for 40s before aborting. */}
      <PageHead
        language={language}
        back={{ href: theoryLangPath(language.code), label: `Lý thuyết ${language.name}`, prefetch: false }}
        title={titleVi}
        lede={leadVi}
      />
      <div className={`${s.body} mx-auto max-w-page px-6`}>
        <div className={toc ? s.withToc : undefined}>
          {toc}
          <div className={s.flow}>{children}</div>
        </div>
        <NextBlock lang={language.code} block={block} />
      </div>
    </main>
  )
}
