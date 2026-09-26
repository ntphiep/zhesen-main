import Link from 'next/link'
import { formatPronunciation } from '@/lib/dictionary/pronunciation'
import { theoryContent } from '@/lib/theory/content'
import { splitIpa } from '@/lib/theory/ipa'
import { phonemePath } from '@/lib/theory/path'
import type { LangCode } from '@/lib/languages'

/**
 * A transcription where every sound links to its entry on the pronunciation page. Only
 * where one word is shown, the word page or an expanded wordlist row: in a list the links
 * would outnumber the words. A language with no phoneme table renders exactly what `Ipa`
 * renders.
 */
export function IpaLinked({ value, lang, className = '' }: {
  value: string | null
  lang: LangCode
  className?: string
}) {
  const shown = formatPronunciation(value, lang)
  if (!shown) return null

  const content = theoryContent(lang)
  const anchors = new Map<string, string>()
  for (const p of content?.phonemes ?? []) {
    anchors.set(p.symbol, p.symbol)
    if (p.gaSymbol) anchors.set(p.gaSymbol, p.symbol)
  }
  if (anchors.size === 0) return <span className={`ipa ${className}`.trim()}>{shown}</span>

  return (
    <span className={`ipa ${className}`.trim()}>
      {splitIpa(shown, [...anchors.keys()]).map((t, i) => {
        const anchor = t.symbol && anchors.get(t.symbol)
        if (!anchor) return <span key={i}>{t.text}</span>
        return (
          <Link
            key={i}
            href={phonemePath(lang, anchor)}
            className="hover:underline hover:decoration-dotted"
            title={`Âm /${anchor}/`}
          >
            {t.text}
          </Link>
        )
      })}
    </span>
  )
}
