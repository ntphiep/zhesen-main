import Link from 'next/link'
import { AudioButton } from '@/components/ui/AudioButton'
import { TappableText } from '@/components/reader/TappableText'
import { grammarLangPath } from '@/lib/grammar/path'
import type { GrammarPointDetail } from '@/lib/grammar/types'

/** `/grammar/[lang]/[id]`: one grammar point, its formula, explanation, common
 * mistake, and worked examples with reading (pinyin, for zh) and translation. */
export function GrammarPointDetailView({ point }: { point: GrammarPointDetail }) {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
      <Link href={grammarLangPath(point.lang)} className="text-sm text-black/50 hover:underline">← Ngữ pháp {point.level}</Link>

      <div>
        {point.categoryVi && <p className="text-sm font-semibold uppercase tracking-wide text-black/40">{point.categoryVi}</p>}
        <h1 className="mt-1 text-3xl font-bold">{point.titleVi}</h1>
      </div>

      <section className="rounded-xl bg-black/5 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-black/40">Công thức</p>
        <p className="mt-1 font-mono text-base text-black/90">{point.pattern}</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Giải thích</h2>
        <p className="whitespace-pre-line text-black/80">{point.explanationVi}</p>
      </section>

      {point.commonMistakeVi && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Lỗi hay mắc</p>
          <p className="mt-1 text-amber-900">{point.commonMistakeVi}</p>
        </section>
      )}

      {point.examples.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Ví dụ</h2>
          <ul className="flex flex-col gap-3">
            {point.examples.map((e, i) => (
              <li key={i} className="flex flex-col gap-0.5 border-l-2 border-black/10 pl-3">
                {e.reading && <p className="ipa text-sm text-black/40">{e.reading}</p>}
                <div className="flex items-center gap-2">
                  <span className="text-black/80"><TappableText text={e.text} lang={point.lang} /></span>
                  <AudioButton text={e.text} lang={point.lang} />
                </div>
                <p className="text-sm text-black/50">{e.translationVi}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
