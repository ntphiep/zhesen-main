import Link from 'next/link'
import { theoryLangPath } from '@/lib/theory/path'
import { BLOCKS_BY_LANG } from '@/lib/theory/blocks'
import { ArrowLeft, ArrowRight } from './Glyphs'
import s from './Theory.module.css'
import type { Language, LangCode } from '@/lib/languages'

/** `/theory`: one tile per language, listing the blocks that language has, in the
 *  colours of the landing page's theory tiles. */
export function TheoryLangList({ languages, grammarCounts }: {
  languages: readonly Language[]
  grammarCounts: Record<LangCode, number>
}) {
  return (
    <main className={`${s.page} font-ui`}>
      <header className={`${s.head} mx-auto max-w-page px-6`}>
        <Link href="/" className={s.crumb}><ArrowLeft /><span>Trang chủ</span></Link>
        <h1 className={s.title}>Lý thuyết</h1>
        <p className={s.lede}>
          Học phần không đổi của một ngôn ngữ: âm, từ loại, cấu trúc câu, ngữ pháp và những từ đi với nhau.
        </p>
      </header>

      <div className="mx-auto max-w-page px-6 pb-16">
        <div className={s.langs}>
          {languages.map((l, i) => (
            <Link key={l.code} href={theoryLangPath(l.code)} data-l={l.code} data-reveal={i} className={s.lang}>
              <span className={s.hw} lang={l.code}>{l.nativeName}</span>
              <b>{l.name}</b>
              <span>{BLOCKS_BY_LANG[l.code].length} phần · {grammarCounts[l.code]} điểm ngữ pháp</span>
              <span className={s.open}><span>Mở</span><ArrowRight /></span>
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}
