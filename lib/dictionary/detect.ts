import type { LangCode } from '@/lib/languages'
import type { DictEntryPreview } from './types'

/** Which of the three dictionary languages a foreign query is written in. There is no
 *  Vietnamese detector any more: the lookup page has one box per direction, so the
 *  learner says which way round the query runs and nothing has to guess. */
const HAN = /\p{Script=Han}/u
const SPANISH = /[ñáéíóúü¿¡]/iu

/** Order the supported languages by how likely the query belongs to each: Han to Chinese,
 *  Spanish-only letters to Spanish, else English. Always returns all three. */
export function detectOrder(query: string): LangCode[] {
  const q = query.trim()
  if (HAN.test(q)) return ['zh', 'en', 'es']
  if (SPANISH.test(q)) return ['es', 'en', 'zh']
  return ['en', 'es', 'zh']
}

/** Reorder the language groups by how well each actually matched, `fallback` breaking ties.
 *  "corriendo" put corridor, condo and corridors, three trigram guesses under 1.0, above
 *  correr at 3.51. An entry with no score counts as zero, leaving that caller on the
 *  heuristic order. */
export function orderByBestMatch(
  fallback: LangCode[],
  ...groups: Partial<Record<LangCode, DictEntryPreview[]>>[]
): LangCode[] {
  const best = (lang: LangCode) =>
    Math.max(0, ...groups.flatMap((g) => g[lang] ?? []).map((e) => e.matchScore ?? 0))
  return [...fallback].sort((a, b) => best(b) - best(a) || fallback.indexOf(a) - fallback.indexOf(b))
}

/** `lex.search` scores a structural match (exact headword, prefix, inflection, pinyin) at
 *  3.0 or above and caps its trigram arm at 2.9, so the two bands never overlap. */
const STRUCTURAL_FLOOR = 2.95

export function isStructuralMatch(e: DictEntryPreview): boolean {
  return (e.matchScore ?? 0) >= STRUCTURAL_FLOOR
}
