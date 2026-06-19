import { AudioButton } from '@/components/AudioButton'
import type { DictExample } from '@/lib/dictionary/types'
import type { LangCode } from '@/lib/content/types'

export function ExampleList({ examples, lang }: { examples: DictExample[]; lang: LangCode }) {
  if (examples.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Ví dụ</h2>
      <ul className="flex flex-col gap-2">
        {examples.map((e, i) => (
          <li key={i} className="flex flex-col gap-0.5 border-l-2 border-black/10 pl-3">
            <div className="flex items-center gap-2">
              <p className="text-black/80">{e.text}</p>
              <AudioButton text={e.text} lang={lang} />
            </div>
            {e.translationVi && <p className="text-sm text-black/50">{e.translationVi}</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}
