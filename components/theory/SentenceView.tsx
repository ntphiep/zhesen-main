import { BlockPage } from './BlockPage'
import { ExampleList } from './ExampleList'
import { MistakeList } from './MistakeList'
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
    >
      <nav aria-label="Chủ đề" className="mt-6 flex flex-wrap gap-2">
        {topics.map((t) => (
          <a key={t.id} href={`#${t.id}`} className="rounded-lg border border-black/10 px-3 py-1.5 text-sm hover:bg-black/5">
            {t.titleVi}
          </a>
        ))}
      </nav>

      <div className="mt-10 flex flex-col gap-12">
        {topics.map((t) => (
          <section key={t.id} id={t.id} className="flex flex-col gap-5">
            <div>
              <h2 className="text-2xl font-semibold">{t.titleVi}</h2>
              <p className="mt-1 text-black/70">{t.introVi}</p>
            </div>

            {t.items.map((item) => (
              <article key={item.titleVi} className="rounded-2xl border border-black/10 px-5 py-4">
                <h3 className="font-semibold">{item.titleVi}</h3>
                {item.formula && (
                  <p className="mt-1 font-mono text-sm text-black/60">{item.formula}</p>
                )}
                <p className="mt-2 text-black/80">{item.explainVi}</p>
                <div className="mt-3">
                  <ExampleList examples={item.examples} />
                </div>
              </article>
            ))}

            <MistakeList mistakes={t.mistakes} />
          </section>
        ))}
      </div>
    </BlockPage>
  )
}
