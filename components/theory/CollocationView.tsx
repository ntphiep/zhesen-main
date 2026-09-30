import { BlockPage } from './BlockPage'
import { ExampleList } from './ExampleList'
import { MistakeList } from './MistakeList'
import s from './Theory.module.css'
import type { CollocationPattern, CollocationSet } from '@/lib/theory/types'
import type { Language } from '@/lib/languages'

/** `/theory/[lang]/collocation`: the shapes words pair up in, then the pairs around the
 *  verbs that cause the most trouble. */
export function CollocationView({ language, patterns, sets }: {
  language: Language
  patterns: readonly CollocationPattern[]
  sets: readonly CollocationSet[]
}) {
  return (
    <BlockPage
      language={language}
      block="collocation"
      titleVi="Collocation"
      leadVi="Collocation là những từ quen đi với nhau. Câu đúng ngữ pháp mà sai collocation thì người bản ngữ vẫn nghe ra ngay."
    >
      {patterns.map((p, i) => (
        <section key={p.id} id={p.id} className={s.sec} data-reveal={i === 0 ? '' : undefined}>
          <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
            <h2 className={s.h2}>{p.titleVi}</h2>
            <span className={s.formula}>{p.formula}</span>
          </div>
          <p className={s.prose}>{p.explainVi}</p>
          <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
            <ExampleList examples={p.examples} />
            <MistakeList mistakes={p.mistakes} />
          </div>
        </section>
      ))}

      {sets.length > 0 && (
        <section className={s.sec}>
          <h2 className={s.h2}>Những động từ hay nhầm lẫn</h2>
          <div className={s.grid}>
            {sets.map((set) => (
              <article key={set.head} className={`${s.card} flex flex-col gap-2`} data-accent="">
                <h3 className={s.h3}>{set.titleVi}</h3>
                <p className={s.note}>{set.noteVi}</p>
                <ul className={s.examples} data-dense="">
                  {set.items.map((item) => (
                    <li key={item.en} className={s.pair}>
                      <span className={s.src} lang={language.code}>{item.en}</span>
                      <span className={s.vi}>{item.vi}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      )}
    </BlockPage>
  )
}
