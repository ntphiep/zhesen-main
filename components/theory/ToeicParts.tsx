import Link from 'next/link'
import { buildGrammarPointId, grammarPointPath } from '@/lib/grammar/path'
import { ArrowRight, Warn } from './Glyphs'
import s from './Theory.module.css'
import type { ToeicGrammarItem, ToeicParaphrase, ToeicPart, ToeicTip } from '@/lib/theory/types'
import type { LangCode } from '@/lib/languages'

// The blocks the TOEIC page and a part's own page share.

/** A part's tips, then its traps. `trapHeading` keeps the outline whole: an h4 under the
 *  part's h3 on the TOEIC page, an h2 under the part's own page title. */
export function PartBody({ part, trapHeading: Heading }: { part: ToeicPart; trapHeading: 'h2' | 'h4' }) {
  return (
    <>
      <TipList tips={part.tips} />
      <section className={s.callout}>
        <Heading className={s.label}><Warn />Bẫy hay gặp</Heading>
        <ul>
          {part.traps.map((t) => (
            <li key={t.titleVi}>
              <p className="m-0 font-bold">{t.titleVi}</p>
              <p className={s.small}>{t.bodyVi}</p>
              {t.example && (
                <div className={`${s.example} mt-2`}>
                  <p className={s.src} lang="en">{t.example.en}</p>
                  <p className={s.vi}>{t.example.vi}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

function TipList({ tips }: { tips: readonly ToeicTip[] }) {
  return (
    <ul className={`${s.grid} m-0 list-none p-0`}>
      {tips.map((t) => (
        <li key={t.titleVi} className={`${s.card} flex flex-col gap-2`}>
          <p className={s.h3} data-sm="">{t.titleVi}</p>
          <p className={s.small}>{t.bodyVi}</p>
          {t.example && (
            <div className={s.example}>
              <p className={s.src} lang="en">{t.example.en}</p>
              <p className={s.vi}>{t.example.vi}</p>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

export function GrammarGrid({ lang, grammar }: { lang: LangCode; grammar: readonly ToeicGrammarItem[] }) {
  return (
    <div className={s.grid}>
      {grammar.map((g) => (
        <article key={g.titleVi} className={`${s.card} flex flex-col gap-3`}>
          <h3 className={s.h3}>{g.titleVi}</h3>
          {g.formula && <p className={s.formula}>{g.formula}</p>}
          <p className={s.small}>{g.explainVi}</p>
          <div className={s.example}>
            <p className={s.src} lang="en">{g.example.en}</p>
            <p className={s.vi}>{g.example.vi}</p>
          </div>
          {g.grammarKey && (
            <Link
              href={grammarPointPath(buildGrammarPointId(lang, g.grammarKey))}
              prefetch={false}
              className={`${s.more} mt-auto`}
            >
              Xem bài ngữ pháp <ArrowRight />
            </Link>
          )}
        </article>
      ))}
    </div>
  )
}

export function ParaphraseList({ paraphrases }: { paraphrases: readonly ToeicParaphrase[] }) {
  return (
    <ul className={`${s.grid} m-0 list-none p-0`}>
      {paraphrases.map((p) => (
        <li key={p.heard} className={`${s.card} flex flex-col gap-1`}>
          <p className={`${s.src} ${s.heard}`} lang="en">{p.heard}</p>
          <p className={`${s.src} ${s.answer}`} lang="en">{p.answer}</p>
          <p className={s.vi}>{p.vi}</p>
        </li>
      ))}
    </ul>
  )
}

/** The way on to the next part or topic, drawn as `NextBlock` draws the next block. */
export function NextPage({ href, title, prefetch }: { href: string; title: string; prefetch?: false }) {
  return (
    <Link href={href} prefetch={prefetch} className={s.next}>
      <span>
        <span className={s.label}>Tiếp theo</span>
        <b>{title}</b>
      </span>
      <ArrowRight />
    </Link>
  )
}
