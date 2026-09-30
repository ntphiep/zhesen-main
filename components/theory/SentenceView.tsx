import { BlockPage } from './BlockPage'
import { ExampleList } from './ExampleList'
import { MistakeList } from './MistakeList'
import s from './Theory.module.css'
import type { SentenceTopic } from '@/lib/theory/types'
import type { Language } from '@/lib/languages'

/** `/theory/[lang]/sentence`: phrases, clauses, the kinds of sentence and word order.
 *  One page with an anchor per topic rather than four pages: a reader comparing a phrase
 *  with a clause wants both in front of them. */
export function SentenceView({ language, topics }: { language: Language; topics: readonly SentenceTopic[] }) {
  return (
    <BlockPage
      language={language}
      block="sentence"
      titleVi="Câu và cụm từ"
      leadVi="Từ ghép thành cụm, cụm ghép thành mệnh đề, mệnh đề ghép thành câu. Biết ba tầng này là đọc được câu dài."
      toc={
        <nav aria-label="Chủ đề" className={s.toc}>
          {topics.map((t) => (
            <a key={t.id} href={`#${t.id}`} className={s.chip}>{t.titleVi}</a>
          ))}
        </nav>
      }
    >
      {topics.map((t, i) => (
        <section key={t.id} id={t.id} className={s.sec} data-reveal={i === 0 ? '' : undefined}>
          <h2 className={s.h2}>{t.titleVi}</h2>
          <p className={s.prose}>{t.introVi}</p>

          {t.items.map((item) => (
            <article key={item.titleVi} className={`${s.card} flex flex-col gap-3`}>
              <h3 className={s.h3}>{item.titleVi}</h3>
              {item.formula && <p className={s.formula}>{item.formula}</p>}
              <p className={s.small}>{item.explainVi}</p>
              <ExampleList examples={item.examples} />
            </article>
          ))}

          <MistakeList mistakes={t.mistakes} />
        </section>
      ))}
    </BlockPage>
  )
}
