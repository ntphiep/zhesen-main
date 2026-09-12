import { AudioButton } from '@/components/ui/AudioButton'
import { TappableText } from '@/components/reader/TappableText'
import { isCleanExample } from '@/lib/dictionary/search'
import type { DictExample } from '@/lib/dictionary/types'
import type { LangCode } from '@/lib/languages'

const MAX_EXAMPLES = 6

export function ExampleList({ examples, lang }: { examples: DictExample[]; lang: LangCode }) {
  // Drop examples whose words have run together (pipeline data corruption) and cap the list.
  const clean = examples.filter((e) => isCleanExample(e.text)).slice(0, MAX_EXAMPLES)
  if (clean.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Ví dụ</h2>
      <ul className="flex flex-col gap-2">
        {clean.map((e, i) => (
          <li key={i} className="flex flex-col gap-0.5 border-l-2 border-black/10 pl-3">
            <div className="flex items-center gap-2">
              <span className="text-black/80"><TappableText text={e.text} lang={lang} /></span>
              <AudioButton text={e.text} lang={lang} />
            </div>
            {e.translationVi && <p className="text-sm text-black/50">{e.translationVi}</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}
