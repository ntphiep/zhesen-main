import { formatPronunciation } from '@/lib/dictionary/pronunciation'
import type { LangCode } from '@/lib/languages'

/**
 * A pronunciation, delimited the way its source meant it, or nothing at all.
 *
 * Eleven places used to render this, each deciding for itself whether to add
 * slashes. Half of them were wrong for one language or another -- see
 * formatPronunciation for what the sources actually store. Rendering goes
 * through here so there is one answer instead of eleven.
 *
 * The `ipa` class picks a font with the phonetic glyphs; see app/globals.css.
 */
export function Ipa({ value, lang, className = '' }: { value: string | null; lang: LangCode; className?: string }) {
  const shown = formatPronunciation(value, lang)
  if (!shown) return null
  return <span className={`ipa ${className}`.trim()}>{shown}</span>
}
