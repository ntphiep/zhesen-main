import { AudioButton } from '@/components/ui/AudioButton'
import { TappableText } from '@/components/reader/TappableText'
import { pickExamples } from '@/lib/dictionary/textQuality'
import type { ResolvedText } from '@/lib/dictionary/tappable'
import type { DictExample } from '@/lib/dictionary/types'
import type { LangCode } from '@/lib/languages'

export function ExampleList({
  examples, lang, resolved = [],
}: {
  examples: DictExample[]
  lang: LangCode
  /** Pre-resolved on the server, so the sentences are in the HTML. Without it
   * each TappableText resolves itself in the browser. */
  resolved?: ResolvedText[]
}) {
  const clean = pickExamples(examples)
  if (clean.length === 0) return null
  const byText = new Map(resolved.map((r) => [r.text, r]))
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Ví dụ</h2>
      <ul className="flex flex-col gap-2">
        {clean.map((e, i) => (
          <li key={i} className="flex flex-col gap-0.5 border-l-2 border-black/10 pl-3">
            <div className="flex items-center gap-2">
              <span className="text-black/80">
                <TappableText text={e.text} lang={lang} resolved={byText.get(e.text)} />
              </span>
              <AudioButton text={e.text} lang={lang} />
            </div>
            {e.translationVi && <p className="text-sm text-black/50">{e.translationVi}</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}
