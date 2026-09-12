import type { LangCode } from '@/lib/languages'
import type { DictEntryPreview } from './types'

const HAN = /\p{Script=Han}/u
const SPANISH = /[ñáéíóúü¿¡]/iu

/**
 * Vietnamese-exclusive signal: đ/ơ/ư/ă (not used by en/es/zh headwords at all)
 * plus the Latin Extended Additional block (U+1EA0-U+1EF9), which covers every
 * other Vietnamese tone-marked vowel (ạ, ấ, ằ, ệ, ...). Deliberately excludes
 * â/ê/ô alone -- those are shared with French/Portuguese loanwords and are too
 * weak a signal on their own; the marks below never appear in this app's en/es/zh
 * data (verified: 0 matches when spot-checked against headword_normalized).
 */
const VIETNAMESE = /[đĐơƠưƯăĂẠ-ỹ]/u

/**
 * Order the supported languages by how likely the query belongs to each, so a
 * "search all languages" UI can show the most relevant group first. Heuristic:
 * Han script -> Chinese; Spanish-only letters/punctuation -> Spanish; else English.
 * Always returns all three (results are grouped, never filtered out).
 */
export function detectOrder(query: string): LangCode[] {
  const q = query.trim()
  if (HAN.test(q)) return ['zh', 'en', 'es']
  if (SPANISH.test(q)) return ['es', 'en', 'zh']
  return ['en', 'es', 'zh']
}

/**
 * Whether a query is very likely Vietnamese, based on diacritics unique to
 * Vietnamese among this app's three target languages. Used to decide whether to
 * also run the reverse (Vietnamese -> en/es/zh) lookup -- see
 * lib/dictionary/search.ts `searchBothDirections`, which also falls back to the
 * reverse lookup when this is false but the forward search found nothing (covers
 * Vietnamese typed without diacritics, e.g. "nhan duoc").
 */
export function looksVietnamese(query: string): boolean {
  return VIETNAMESE.test(query.trim())
}

/**
 * Reorder the language groups by how well each actually matched, keeping
 * `fallback` as the tie-break.
 *
 * The script heuristic above only sees the letters typed, and for anything in the
 * Latin alphabet it can only guess English first. Searching the Spanish gerund
 * "corriendo" put corridor, condo and corridors above correr: three weak trigram
 * guesses scoring under 1.0, ahead of the word the learner was reading at 3.51.
 * The scores are already in hand by the time the groups are rendered, so the
 * group with a real match leads and the guesses fall in behind it.
 *
 * Entries without a score (anything not from `lex.search`) count as zero, which
 * leaves such a caller on the heuristic order.
 */
export function orderByBestMatch(
  fallback: LangCode[],
  ...groups: Partial<Record<LangCode, DictEntryPreview[]>>[]
): LangCode[] {
  const best = (lang: LangCode) =>
    Math.max(0, ...groups.flatMap((g) => g[lang] ?? []).map((e) => e.matchScore ?? 0))
  return [...fallback].sort((a, b) => best(b) - best(a) || fallback.indexOf(a) - fallback.indexOf(b))
}
