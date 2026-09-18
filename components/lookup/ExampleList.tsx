import { AudioButton } from '@/components/ui/AudioButton'
import { TappableText } from '@/components/reader/TappableText'
import { pickExamples, isSentenceTranslation, hasUnknownLongWord } from '@/lib/dictionary/textQuality'
import type { ResolvedText } from '@/lib/dictionary/tappable'
import type { DictExample } from '@/lib/dictionary/types'
import type { LangCode } from '@/lib/languages'

export function ExampleList({
  examples, lang, resolved = [], glosses = [],
}: {
  examples: DictExample[]
  lang: LangCode
  /** The entry's own meanings. An example whose "translation" is one of these carries
   * the entry gloss, not a translation of the sentence; see isSentenceTranslation. */
  glosses?: (string | null)[]
  /** Pre-resolved on the server, so the sentences are in the HTML. Without it
   * each TappableText resolves itself in the browser. */
  resolved?: ResolvedText[]
}) {
  const byText = new Map(resolved.map((r) => [r.text, r]))
  // Drop a sentence whose words the dictionary cannot account for; see hasUnknownLongWord.
  // Only possible where the server resolved the text, so grammar pages keep the old check.
  const clean = pickExamples(examples).filter((e) => {
    const r = byText.get(e.text)
    if (!r || lang === 'zh') return true
    return !hasUnknownLongWord(r.segments, new Set(r.entries.map(([token]) => token)))
  })
  if (clean.length === 0) return null
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
            {isSentenceTranslation(e.translationVi, glosses) && <p className="text-sm text-black/50">{e.translationVi}</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}
