import { AudioButton } from '@/components/ui/AudioButton'
import { TappableText } from '@/components/reader/TappableText'
import { PageHead } from '@/components/theory/BlockPage'
import { Warn } from '@/components/theory/Glyphs'
import s from '@/components/theory/Theory.module.css'
import { grammarLangPath } from '@/lib/grammar/path'
import { getLanguage } from '@/lib/languages'
import type { ResolvedText } from '@/lib/dictionary/tappable'
import type { GrammarPointDetail } from '@/lib/grammar/types'

/** `/theory/[lang]/grammar/[id]`: one grammar point, its formula, explanation, common
 * mistake, and worked examples with reading (pinyin, for zh) and translation. */
export function GrammarPointDetailView({ point, resolved = [] }: {
  point: GrammarPointDetail
  /** Pre-resolved on the server, so the sentences are in the HTML. Without it
   * each TappableText resolves itself in the browser. */
  resolved?: ResolvedText[]
}) {
  const byText = new Map(resolved.map((r) => [r.text, r]))
  const language = getLanguage(point.lang)
  if (!language) return null
  return (
    <main className={`${s.page} font-ui`} data-l={point.lang}>
      <PageHead
        language={language}
        back={{ href: grammarLangPath(point.lang), label: `Ngữ pháp ${point.level ?? ''}`.trim() }}
        title={point.titleVi}
      >
        {(point.level || point.categoryVi) && (
          <p className="mt-4 flex flex-wrap gap-2">
            {point.level && <span className={s.tag}>{point.level}</span>}
            {point.categoryVi && <span className={s.tag}>{point.categoryVi}</span>}
          </p>
        )}
      </PageHead>

      <div className={`${s.body} ${s.split} mx-auto max-w-page px-6`}>
        <div className={s.flow}>
          <section className={`${s.card} flex flex-col gap-2`} data-accent="" data-reveal="">
            <h2 className={s.label}>Công thức</h2>
            <p className={s.pattern} data-lg="">{point.pattern}</p>
          </section>

          <section className={s.sec}>
            <h2 className={s.h2}>Giải thích</h2>
            <p className={s.prose} data-pre="">{point.explanationVi}</p>
          </section>

          {point.commonMistakeVi && (
            <section className={s.callout}>
              <h2 className={s.label}><Warn />Lỗi hay mắc</h2>
              <p className={s.prose}>{point.commonMistakeVi}</p>
            </section>
          )}
        </div>

        {point.examples.length > 0 && (
          <section className={s.sec} data-reveal="1">
            <h2 className={s.h2}>Ví dụ</h2>
            <ul className={s.examples}>
              {point.examples.map((e, i) => (
                <li key={i} className={s.example}>
                  {e.reading && <p className={`ipa ${s.reading}`}>{e.reading}</p>}
                  <div className="flex items-center gap-2">
                    <span className={s.src} lang={point.lang}><TappableText text={e.text} lang={point.lang} resolved={byText.get(e.text)} translation={e.translationVi} /></span>
                    <AudioButton text={e.text} lang={point.lang} />
                  </div>
                  <p className={s.vi}>{e.translationVi}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  )
}
