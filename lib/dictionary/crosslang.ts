import type { LangCode } from '@/lib/languages'

/**
 * Cross-language linking via an English pivot.
 *
 * The `cross_language_links` concept table in the data is ~99.7% intra-English
 * (it links English synonyms to each other), so it cannot drive a "this word in
 * other languages" panel. The one field every entry in every language carries is
 * `gloss_en`. We bridge through it: a zh/es entry's English gloss (e.g. 狗 ->
 * "dog") points at the English headword, and an English headword points back at
 * any zh/es entry that glosses to it.
 */

/**
 * Normalize a `gloss_en` value into a candidate English headword, or null if what
 * is left does not read as a single equivalent.
 *
 * Most Spanish and Chinese senses are written as the equivalent followed by a
 * definition: "dog (the species Canis familiaris ...)", "cat (unspecified
 * gender)", "pop, soda (soft drink)". Rejecting anything with a bracket in it
 * threw away the commonest shape in the data -- looking up "perro" found no
 * English equivalent at all -- so the head of the gloss is taken instead:
 * everything before the first "(", ";" or ",".
 *
 * The same expression indexes the other side of the match, in
 * `lex.match_cross_language`. If one changes, both must.
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

/** The English pivot terms for an entry: its own normalized headword for English,
 * otherwise its cleaned English glosses (deduped, order preserved). */
export function entryPivots(lang: LangCode, headwordNormalized: string, glossEns: (string | null)[]): string[] {
  if (lang === 'en') return headwordNormalized ? [headwordNormalized] : []
  const out: string[] = []
  for (const g of glossEns) {
    const term = cleanGlossTerm(g)
    if (term && !out.includes(term)) out.push(term)
  }
  return out
}
