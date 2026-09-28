'use client'
import { useState } from 'react'
import { AudioButton } from '@/components/ui/AudioButton'
import { TappableText } from '@/components/reader/TappableText'
import { isCleanExample, isSentenceTranslation } from '@/lib/dictionary/textQuality'
import { knownWordExamples, SHOWN_EXAMPLES } from '@/lib/dictionary/wordPage'
import type { ResolvedText } from '@/lib/dictionary/tappable'
import type { DictExample } from '@/lib/dictionary/types'
import type { LangCode } from '@/lib/languages'

export function ExampleList({
  examples, lang, resolved = [], glosses = [], title = 'Ví dụ khác',
}: {
  examples: DictExample[]
  lang: LangCode
  /** The entry's own meanings. An example whose "translation" is one of these carries
   * the entry gloss, not a translation of the sentence; see isSentenceTranslation. */
  glosses?: (string | null)[]
  /** Pre-resolved on the server, so the sentences are in the HTML. Without it
   * each TappableText resolves itself in the browser. */
  resolved?: ResolvedText[]
  title?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const byText = new Map(resolved.map((r) => [r.text, r]))
  const clean = knownWordExamples(examples.filter((e) => isCleanExample(e.text)), resolved, lang)
  if (clean.length === 0) return null
  const shown = expanded ? clean : clean.slice(0, SHOWN_EXAMPLES)
  const hidden = clean.length - shown.length
  return (
    <section id="examples" className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <ul className="flex flex-col gap-2">
        {shown.map((e, i) => (
          <li key={i} className="flex flex-col gap-0.5 border-l-2 border-black/10 pl-3">
            <div className="flex items-center gap-2">
              <span className="text-black/80">
                <TappableText text={e.text} lang={lang} resolved={byText.get(e.text)} />
              </span>
              <AudioButton text={e.text} lang={lang} />
            </div>
            {isSentenceTranslation(e.translationVi, glosses) && <p className="text-sm text-black/55">{e.translationVi}</p>}
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-fit text-sm font-medium text-blue-700 hover:underline"
        >
          {`Xem thêm ${hidden} ví dụ`}
        </button>
      )}
    </section>
  )
}
