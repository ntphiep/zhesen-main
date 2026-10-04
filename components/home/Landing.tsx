import { Fragment } from 'react'
import Link from 'next/link'
import { getLanguage, type LangCode } from '@/lib/languages'
import { theoryLangPath } from '@/lib/theory/path'
import type { Answers, PhraseFamily, TakeMap } from '@/lib/home/landing'
import type { WorldFact } from '@/lib/home/worldFacts'
import { LandingWorld } from './LandingWorld'
import { ReviewDemo } from './ReviewDemo'
import { Phrases } from './Phrases'
import { SensesMap } from './SensesMap'
import { Reveal } from './Reveal'
import { newsreader, patrickHand } from './fonts'
import s from './Landing.module.css'

const THEORY: { lang: LangCode; text: string }[] = [
  { lang: 'en', text: 'Phát âm, ngữ pháp và cách dùng từ, giải thích bằng tiếng Việt. Chỉ ra trước những chỗ người Việt hay nhầm.' },
  { lang: 'zh', text: 'Đi từ những câu đầu tiên tới ngữ pháp khó hơn, theo từng trình độ. Gặp từ mới thì lưu luôn vào sổ tay để ôn.' },
  { lang: 'es', text: 'Danh từ có giống, động từ đổi theo ngôi. Giải thích từ đầu những thứ tiếng Việt không có, dễ trước khó sau.' },
]

const ARROW = <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 10h12M11 5l5 5-5 5" /></svg>

/** The page every visitor sees at `/`: the globe and lookup, then what happens to a saved
 *  word, the senses of take, one verb's phrasal verbs, and the way into each language's theory. */
export function Landing({ example, facts, take, phrases }: {
  example: Answers | null
  facts: Record<LangCode, WorldFact>
  take: TakeMap | null
  phrases: PhraseFamily | null
}) {
  return (
    <Reveal className={`${s.landing} ${newsreader.variable} ${patrickHand.variable}`}>
      <LandingWorld example={example} facts={facts} />

      <section id="review" className={s.review} aria-labelledby="review-title">
        <div className={s.wrap}>
          <h2 id="review-title" className={s.h2} data-reveal="">Từ đã lưu quay lại trước khi quên.</h2>
          <p className={s.lede} data-reveal="" data-i="1">
            Mỗi từ đã lưu có lịch ôn riêng. Luyện cách nào cũng ghi vào lịch đó. Nhớ tốt thì từ quay lại muộn hơn, quên thì quay lại sớm hơn.
          </p>
          <ReviewDemo example={example} />
        </div>
      </section>

      {take && (
        <section className={s.senses} aria-labelledby="senses-title">
          <div className={s.wrap}>
            <h2 id="senses-title" className={s.h2} data-reveal="">Từ {take.headword} có {take.senseCount >= 10 ? 'rất nhiều' : take.senseCount} nghĩa. Zhesen đưa những nghĩa hay gặp lên trước.</h2>
            <p className={s.lede} data-reveal="" data-i="1">
              Mỗi nghĩa chính có cụm từ hay đi kèm, câu ví dụ và từ tương đương trong tiếng Trung, tiếng Tây Ban Nha. Những nghĩa ít gặp vẫn nằm ở trang từ, xếp riêng bên dưới.
            </p>
            <SensesMap take={take} />
            {take.tail.length > 0 && (
              <div className={s.tail} data-reveal="">
                <p>Các nghĩa khác trên trang của {take.headword}</p>
                <div>{take.tail.map((t) => <span key={t}>{t}</span>)}</div>
              </div>
            )}
            <Link className={s.go} href={take.href} prefetch={false}>Mở trang của {take.headword}</Link>
          </div>
        </section>
      )}

      {phrases && (
        <section className={s.phrases} aria-labelledby="phrases-title">
          <div className={s.wrap}>
            <h2 id="phrases-title" className={s.h2} data-reveal="">
              {phrases.phrases.slice(0, 2).map((p, i) => (
                <Fragment key={p.href}>{i > 0 && ', '}<span lang="en">{p.headword}</span> là {p.vi}</Fragment>
              ))}.
            </h2>
            <p className={s.lede} data-reveal="" data-i="1">
              Mỗi cụm động từ có nghĩa riêng, nối sang từ cùng nghĩa trong tiếng Trung và <span className={s.nw}>tiếng Tây Ban Nha</span>.
            </p>
            <Phrases family={phrases} />
          </div>
        </section>
      )}

      <section className={s.theory} aria-label="Lý thuyết">
        {THEORY.map((t, i) => {
          const language = getLanguage(t.lang)
          if (!language) return null
          const vi = language.name.replace('Tiếng', 'tiếng')
          return (
            <Link key={t.lang} href={theoryLangPath(t.lang)} prefetch={false} data-l={t.lang} data-reveal="" data-i={i}>
              <span className={s.endo} lang={t.lang}>{language.nativeName}</span>
              <span className={s.tvi}>{language.name}</span>
              <p>{t.text}</p>
              <span className={s.open}><span>Vào phần {vi}</span>{ARROW}</span>
            </Link>
          )
        })}
      </section>
    </Reveal>
  )
}
