import { formatPronunciation } from '@/lib/dictionary/pronunciation'
import type { LangCode } from '@/lib/languages'

/**
 * A pronunciation, delimited the way its source meant it, or nothing at all.
 *
 * One place decides whether to add slashes, from what the source actually
 * stores; see `formatPronunciation`.
 *
 * The `ipa` class picks a font with the phonetic glyphs; see app/globals.css.
 */
export function Ipa({ value, lang, className = '' }: { value: string | null; lang: LangCode; className?: string }) {
  const shown = formatPronunciation(value, lang)
  if (!shown) return null
  return <span className={`ipa ${className}`.trim()}>{shown}</span>
}
