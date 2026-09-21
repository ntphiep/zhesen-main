import { LookupPanel } from './LookupPanel'
import { LANG_LABELS } from '@/lib/dictionary/labels'
import type { LangCode } from '@/lib/languages'

/**
 * The lookup, both directions, side by side. One box per direction because nothing in a
 * Vietnamese word separates it from an English or Spanish one, so guessing was wrong often
 * enough that "cá" answered with ca, can and called.
 *
 * `lang` scopes both boxes to one language, which is what the per-language hub wants: the
 * target chips disappear, because the caller already decided.
 */
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
        placeholder="con cá · hoà bình · tôi muốn mua một cái bàn"
        hint={lang ? undefined : 'Bấm để bật hoặc tắt một ngôn ngữ. Gõ không dấu vẫn tìm được.'}
        autoFocus={autoFocus && !initialQuery}
      />
      <div className="lg:border-l lg:border-black/10 lg:pl-8">
        <LookupPanel
          direction="fw"
          lang={lang}
          label={`${other} sang tiếng Việt`}
          placeholder="fish · pez · 魚 · I want to buy a new desk"
          hint="Gõ sai chính tả hoặc thiếu dấu vẫn tìm được."
          initialQuery={initialQuery}
          autoFocus={autoFocus && !!initialQuery}
        />
      </div>
    </div>
  )
}
