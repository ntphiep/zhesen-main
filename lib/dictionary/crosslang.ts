import type { LangCode } from '@/lib/languages'

/**
 * Cross-language linking via an English pivot. The `cross_language_links` concept table is
 * ~99.7% intra-English, so it cannot drive an "other languages" panel; `gloss_en` is the
 * one field every entry in every language carries, so the bridge runs through it.
 */

/**
 * Normalize a `gloss_en` into a candidate English headword, or null when what is left does
 * not read as a single equivalent. Most zh and es senses are the equivalent followed by a
 * definition ("pop, soda (soft drink)"), so the head before the first "(", ";" or "," is
 * taken. The same expression indexes the other side in `lex.match_cross_language`: change
 * one and both must change.
 */
export function cleanGlossTerm(gloss: string | null): string | null {
  if (!gloss) return null
  const head = gloss.split(/[(;,]/)[0]
  const t = head.trim().toLowerCase().replace(/^(to|a|an|the)\s+/, '').trim()
  if (!t) return null
  if (/[:"/0-9]/.test(t)) return null
  if (t.split(/\s+/).length > 2) return null
  return t
}

/** The English pivot terms for an entry: its own normalized headword for English, otherwise
 *  its cleaned English glosses, deduped with order preserved. */
export function entryPivots(lang: LangCode, headwordNormalized: string, glossEns: (string | null)[]): string[] {
  if (lang === 'en') return headwordNormalized ? [headwordNormalized] : []
  const out: string[] = []
  for (const g of glossEns) {
    const term = cleanGlossTerm(g)
    if (term && !out.includes(term)) out.push(term)
  }
  return out
}
