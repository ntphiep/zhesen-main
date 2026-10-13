import Link from 'next/link'
import { formatPronunciation } from '@/lib/dictionary/pronunciation'
import { PHONEME_ANCHORS } from '@/lib/theory/anchors'
import { splitIpa } from '@/lib/theory/ipa'
import { phonemePath, theoryBlockPath } from '@/lib/theory/path'
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

  const anchors = new Map(Object.entries(PHONEME_ANCHORS[lang] ?? {}))
  if (anchors.size === 0) return <span className={`ipa ${className}`.trim()}>{shown}</span>

  // On a touch screen one sound is a 5 to 14px target, so there the whole transcription
  // is one link to the sound chart, laid over the per-sound links.
  return (
    <span className={`ipa relative ${className}`.trim()}>
      <Link
        href={theoryBlockPath(lang, 'pronunciation')}
        aria-label="Bảng âm"
        className="absolute -inset-y-1.5 inset-x-0 hidden pointer-coarse:block"
      />
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
