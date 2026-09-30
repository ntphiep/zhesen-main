import { theoryBlockPath } from '@/lib/theory/path'
import { GrammarLinks } from '@/components/lookup/GrammarLinks'
import { PageHead } from './BlockPage'
import { MistakeList } from './MistakeList'
import s from './Theory.module.css'
import type { WordClass } from '@/lib/theory/types'
import type { GrammarPoint } from '@/lib/grammar/types'
import type { Language } from '@/lib/languages'

/** `/theory/[lang]/word-class/[key]`: one class, what it does, the forms it takes, its
 *  subtypes, and the grammar points that govern it. */
export function WordClassView({ language, wordClass: c, grammar }: {
  language: Language
  wordClass: WordClass
  grammar: GrammarPoint[]
}) {
  return (
    <main className={`${s.page} font-ui`} data-l={language.code}>
      <PageHead
        language={language}
        back={{ href: theoryBlockPath(language.code, 'word-class'), label: 'Từ loại' }}
        title={<>{c.titleVi}<small>{c.abbr}</small></>}
        lede={c.oneLineVi}
      />

      <div className={`${s.body} ${s.flow} mx-auto max-w-page px-6`}>
        <section className={`${s.card} flex flex-col gap-2`} data-accent="" data-reveal="">
          <h2 className={s.label}>Vai trò trong câu</h2>
          <p className={s.prose}>{c.roleVi}</p>
        </section>

        {c.forms.length > 0 && (
          <section className={s.sec}>
            <h2 className={s.h2}>Biến đổi hình thái</h2>
            <div className={s.grid}>
              {c.forms.map((f) => <Kind key={f.titleVi} titleVi={f.titleVi} explainVi={f.explainVi} examples={f.examples} lang={language.code} />)}
            </div>
          </section>
        )}

        {c.subtypes.length > 0 && (
          <section className={s.sec}>
            <h2 className={s.h2}>Các loại nhỏ</h2>
            <div className={s.grid}>
              {c.subtypes.map((st) => <Kind key={st.titleVi} titleVi={st.titleVi} explainVi={st.explainVi} examples={st.examples} lang={language.code} />)}
            </div>
          </section>
        )}

        <MistakeList mistakes={c.mistakes} />

        {grammar.length > 0 && <div className={s.related}><GrammarLinks points={grammar} /></div>}
      </div>
    </main>
  )
}

/** A form or a subtype: its name, one line on it, and the words that show it. */
function Kind({ titleVi, explainVi, examples, lang }: {
  titleVi: string
  explainVi: string
  examples: readonly string[]
  lang: Language['code']
}) {
  return (
    <article className={`${s.card} flex flex-col gap-2`}>
      <h3 className={s.h3}>{titleVi}</h3>
      <p className={s.small}>{explainVi}</p>
      <p className={s.words}>
        {examples.map((e) => <span key={e} className={`${s.tag} ${s.hw}`} lang={lang}>{e}</span>)}
      </p>
    </article>
  )
}
