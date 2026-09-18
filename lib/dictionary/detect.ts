import type { LangCode } from '@/lib/languages'
import type { DictEntryPreview } from './types'

const HAN = /\p{Script=Han}/u
const SPANISH = /[ñáéíóúü¿¡]/iu

/** Vietnamese-exclusive signal: đ/ơ/ư/ă plus Latin Extended Additional (U+1EA0-U+1EF9).
 *  Excludes â/ê/ô alone, shared with French and Portuguese loanwords. Verified: 0 matches
 *  against en/es/zh `headword_normalized`. */
const VIETNAMESE = /[đĐơƠưƯăĂẠ-ỹ]/u

/** Order the supported languages by how likely the query belongs to each: Han to Chinese,
 *  Spanish-only letters to Spanish, else English. Always returns all three. */
export function detectOrder(query: string): LangCode[] {
  const q = query.trim()
  if (HAN.test(q)) return ['zh', 'en', 'es']
  if (SPANISH.test(q)) return ['es', 'en', 'zh']
  return ['en', 'es', 'zh']
}

/** Whether a query is very likely Vietnamese, by diacritics unique to Vietnamese among the
 *  three target languages. `searchBothDirections` also runs the reverse lookup when this is
 *  false but the forward search found nothing, covering "nhan duoc" typed without marks. */
export function looksVietnamese(query: string): boolean {
  return VIETNAMESE.test(query.trim())
}

/** Whether the query contains Han script. Vietnamese is Latin, so the reverse lookup cannot
 *  answer such a query: `searchBothDirections` skips a call costing 800 ms for nothing.
 *  22 of 183,526 Vietnamese glosses quote a Han character, all on Chinese entries forward
 *  search already reaches by headword. */
export function looksHan(query: string): boolean {
  return HAN.test(query.trim())
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
