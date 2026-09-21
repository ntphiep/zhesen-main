import { LookupPanel } from './LookupPanel'
import { LANG_LABELS } from '@/lib/dictionary/labels'
import type { LangCode } from '@/lib/languages'

/**
 * The lookup, both directions, side by side. One box per direction because nothing in a
 * Vietnamese word separates it from an English or Spanish one, so guessing was wrong often
 * enough that "cá" answered with ca, can and called.
 *
 * `lang` scopes both boxes to one language, which is what the per-language hub wants: the
 * language chips disappear, because the caller already decided.
 */

/** Under an empty box, in place of a sentence explaining what may be typed. One word, one
 *  word written without its marks, and one whole sentence, because those are the three
 *  things each box accepts and none of them is obvious from the label. */
const VI_EXAMPLES = ['con cá', 'bau troi', 'tôi muốn mua một cái bàn']
const FW_EXAMPLES: Record<LangCode | 'all', readonly string[]> = {
  all: ['fish', 'pez', '魚', 'I want to buy a new desk'],
  en: ['fish', 'recieve', 'I want to buy a new desk'],
  es: ['pez', 'mesa', 'Quiero comprar un escritorio nuevo'],
  zh: ['魚', '朋友', '我想买一张新桌子'],
}

export function LookupPair({ lang, initialQuery = '', autoFocus = false }: {
  lang?: LangCode
  initialQuery?: string
  autoFocus?: boolean
}) {
  const other = lang ? LANG_LABELS[lang] : 'Anh, Trung, Tây Ban Nha'
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <LookupPanel
        direction="vi"
        lang={lang}
        label={`Tiếng Việt sang ${other}`}
        placeholder="Nhập một từ hoặc cả đoạn tiếng Việt"
        examples={VI_EXAMPLES}
        autoFocus={autoFocus && !initialQuery}
      />
      <div className="lg:border-l lg:border-black/10 lg:pl-8">
        <LookupPanel
          direction="fw"
          lang={lang}
          label={`${other} sang tiếng Việt`}
          placeholder={`Nhập một từ hoặc cả đoạn tiếng ${lang ? LANG_LABELS[lang].replace(/^Tiếng /, '') : 'Anh, Trung hoặc Tây Ban Nha'}`}
          examples={FW_EXAMPLES[lang ?? 'all']}
          initialQuery={initialQuery}
          autoFocus={autoFocus && !!initialQuery}
        />
      </div>
    </div>
  )
}
