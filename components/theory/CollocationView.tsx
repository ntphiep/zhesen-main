import { BlockPage } from './BlockPage'
import { ExampleList } from './ExampleList'
import { MistakeList } from './MistakeList'
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
      <div className="mt-8 flex flex-col gap-10">
        {patterns.map((p) => (
          <section key={p.id} id={p.id} className="flex flex-col gap-4">
            <div>
              <div className="flex flex-wrap items-baseline gap-x-3">
                <h2 className="text-xl font-semibold">{p.titleVi}</h2>
                <span className="font-mono text-sm text-black/55">{p.formula}</span>
              </div>
              <p className="mt-1 text-black/75">{p.explainVi}</p>
            </div>
            <ExampleList examples={p.examples} />
            <MistakeList mistakes={p.mistakes} />
          </section>
        ))}
      </div>

      {sets.length > 0 && (
        <section className="mt-14">
          <h2 className="text-xl font-semibold">Những động từ hay nhầm lẫn</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {sets.map((s) => (
              <article key={s.head} className="rounded-2xl border border-black/10 px-5 py-4">
                <h3 className="font-semibold">{s.titleVi}</h3>
                <p className="mt-1 text-sm text-black/60">{s.noteVi}</p>
                <ul className="mt-3 flex flex-col gap-1 text-sm">
                  {s.items.map((i) => (
                    <li key={i.en}>
                      <span className="font-medium text-black/85">{i.en}</span>
                      <span className="text-black/55"> · {i.vi}</span>
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
