import type { Segment } from '@/lib/reader/tokenize'
import type { DictSense } from './types'
import { cleanGlossTerm } from './crosslang'

/**
 * Text-quality heuristics applied before dictionary text reaches the UI: MT artifact
 * stripping, sense selection, CC-CEDICT classifier glosses, corrupted examples.
 */

/** Strip the trailing NER label MT glued onto proper nouns ("Trung QuốcName" -> "Trung
 *  Quốc"); null when still garbled, so the caller falls back to the pivot or English. */
export function cleanMtGloss(gloss: string | null): string | null {
  if (!gloss) return null
  const t = gloss.replace(/(\p{L})Name(?=$|[\s;,)])/gu, '$1').trim()
  if (!t) return null
  if (/LongName|[A-Za-z]\d[A-Za-z]/.test(t)) return null // template / OCR-like leftovers
  if (/[a-zà-ỹ][A-Z]/u.test(t)) return null              // residual CamelCase boundary
  return t
}

/** Words at which a meaning counts as a sentence and keeps its closing full stop. Counted
 *  over 109,182 English senses: under 10 words 13,461 end in a stop and 77,306 do not;
 *  from 10 up, 14,234 do and 4,181 do not. */
const SENTENCE_WORDS = 10

/** Abbreviations whose one dot is part of the word. Not "co": it is a Vietnamese word. */
const ABBREVIATIONS = new Set(['vv', 'tp', 'inc', 'ltd', 'corp', 'jr', 'sr', 'dr', 'mr', 'mrs', 'ms', 'st', 'etc'])

/** Drop the full stop that closes a phrase; a sentence keeps it. "v.v.", "vv." and "..."
 *  are abbreviations and an ellipsis, not a closing stop. */
export function stripPhraseStop(gloss: string): string {
  const words = gloss.trim().split(/\s+/)
  if (words.length >= SENTENCE_WORDS) return gloss
  const last = words[words.length - 1]
  if (!/^[^.]*[^.]\.$/.test(last) || ABBREVIATIONS.has(last.slice(0, -1).toLowerCase())) return gloss
  return gloss.trimEnd().slice(0, -1)
}

/**
 * One casing for every Vietnamese meaning on screen. The source carries three:
 * sampled over 4,000 English senses on 2026-09-20, 2,118 began with a capital and the
 * rest did not, so one entry reads "1. mải mê" then "2. Ý định phạm tội".
 *
 * Normalised UP, not down. Headwords are stored lowercased -- `lex.entries.headword`
 * differs from `headword_normalized` in 0 of 21,004 English rows -- and `pos` is null
 * on the proper-noun senses as often as on any other, so nothing in the data separates
 * "Alberta" from "Một". Lowercasing would turn a place name into a common word;
 * capitalising a common word costs nothing.
 *
 * A gloss written entirely in capitals is the separate defect in #26: the source
 * carries them ("holding" -> "CÔNG TY CỔ PHẦN") and they are not emphasis.
 */
export function cleanGlossVi(gloss: string | null): string | null {
  const trimmed = gloss?.trim()
  if (!trimmed) return null
  const t = stripPhraseStop(trimmed)
  const body = /\p{Lu}/u.test(t) && t === t.toLocaleUpperCase('vi') ? t.toLocaleLowerCase('vi') : t
  // A capital inside the first word is the word's own spelling ("iPhone", "eBay"), so
  // the whole gloss is left as written.
  const first = body.split(/\s+/, 1)[0]
  if (/\p{Lu}/u.test(first.slice(1))) return body
  return body.charAt(0).toLocaleUpperCase('vi') + body.slice(1)
}

/** Whether a sense carries any Vietnamese gloss (direct or via the English pivot). */
const hasVi = (s: DictSense): boolean => Boolean(s.glossVi || s.pivotVi)

/** Senses that print their English definition because no Vietnamese meaning exists. */
export function untranslatedCount(senses: DictSense[]): number {
  return senses.filter((s) => !hasVi(s) && s.glossEn && !isClassifierGloss(s.glossEn)).length
}

/** A sense a learner should meet last: went's obsolete noun "a path" led the page, and
 *  stacked's slang "having large breasts" filled its main card. */
const OLD_REGISTER = /\b(?:obsolete|archaic|dated|rare|vulgar|offensive)\b/

export const isOldSense = (s: Pick<DictSense, 'register'>): boolean => OLD_REGISTER.test(s.register ?? '')

/** Most relevant first: an obsolete, archaic, dated, rare, vulgar or offensive sense last,
 *  then a ranked sense by its `senseFrequency`, then a sense with a Vietnamese gloss (direct
 *  or pivot-derived) ahead of an English-only one, then sense_order. */
export function rankSenses(senses: DictSense[]): DictSense[] {
  const rank = (s: DictSense) => s.senseFrequency ?? Infinity
  return [...senses].sort(
    (a, b) => (Number(isOldSense(a)) - Number(isOldSense(b))) || (rank(a) - rank(b))
      || (Number(hasVi(b)) - Number(hasVi(a))) || a.senseOrder - b.senseOrder,
  )
}

/** The most relevant senses, capped at `max`, in `rankSenses` order. */
export function pickSenses(senses: DictSense[], max = 3): { shown: DictSense[]; hiddenCount: number } {
  return { shown: rankSenses(senses).slice(0, max), hiddenCount: Math.max(0, senses.length - max) }
}

/** Derive a Vietnamese gloss for senses that lack one by bridging through the English
 *  pivot. `viByTerm` maps a cleaned English term to its Vietnamese gloss. */
export function fillPivotVi(senses: DictSense[], viByTerm: Map<string, string>): DictSense[] {
  return senses.map((s) => {
    if (s.glossVi || !s.glossEn) return s
    const term = cleanGlossTerm(s.glossEn)
    const vi = term ? viByTerm.get(term) : undefined
    return vi ? { ...s, pivotVi: vi } : s
  })
}

/** The Vietnamese meaning for an entry. Any caller wanting "the meaning" must check
 *  `sense.pivotVi` too: for most Chinese and Spanish entries `glossVi` is null while a
 *  pivoted meaning is on screen. */
export function entryMeaningVi(
  entry: { glossVi: string | null; senses: DictSense[] },
): string | null {
  if (entry.glossVi) return entry.glossVi
  for (const s of entry.senses) {
    if (s.glossVi) return s.glossVi
    if (s.pivotVi) return s.pivotVi
  }
  return null
}

/** A Chinese sense whose gloss is a CC-CEDICT classifier note (e.g.
 * "CL:隻|只[zhi1],條|条[tiao2]") rather than an actual meaning. */
export function isClassifierGloss(gloss: string | null): boolean {
  return Boolean(gloss && gloss.startsWith('CL:'))
}

/** The simplified classifier characters in a CC-CEDICT "CL:" gloss, where each entry is
 *  `traditional|simplified[pinyin]`. Returns [] for a non-classifier gloss. */
export function parseClassifiers(gloss: string | null): string[] {
  if (!isClassifierGloss(gloss)) return []
  const out: string[] = []
  for (const tok of gloss!.slice(3).split(',')) {
    const noPinyin = tok.replace(/\[[^\]]*\]/g, '').trim()
    if (!noPinyin) continue
    const parts = noPinyin.split('|')
    const simp = (parts.length > 1 ? parts[1] : parts[0]).trim()
    if (simp && !out.includes(simp)) out.push(simp)
  }
  return out
}

// Very common English words, for detecting a token that is several words run together
// ("Ilastsawher" = i+last+saw+her). Must stay small and high-frequency or real long
// words start matching.
const COMMON_WORDS = new Set([
  'i', 'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'as', 'by', 'from',
  'is', 'are', 'was', 'were', 'be', 'been', 'do', 'did', 'does', 'has', 'had', 'have', 'will', 'would',
  'can', 'could', 'not', 'no', 'so', 'but', 'up', 'out', 'all', 'this', 'that', 'these', 'those',
  'he', 'she', 'it', 'we', 'they', 'you', 'me', 'him', 'her', 'his', 'my', 'your', 'our', 'their',
  'who', 'what', 'when', 'where', 'how', 'then', 'there', 'here', 'into', 'over', 'about', 'like', 'just',
  'one', 'two', 'got', 'get', 'see', 'saw', 'last', 'man', 'day', 'hat', 'red', 'blue', 'lake', 'house',
  'mother', 'father', 'child', 'picture', 'history', 'test', 'friend', 'told', 'seen', 'swimmer', 'better', 'far',
])
const MAX_COMMON_LEN = 8

/** Greedy longest-match segmentation of a lowercase token into COMMON_WORDS.
 * Returns the number of pieces, or 0 if it cannot be fully segmented. */
function segmentCommon(token: string): number {
  let i = 0
  let pieces = 0
  while (i < token.length) {
    let matched = 0
    for (let len = Math.min(MAX_COMMON_LEN, token.length - i); len >= 1; len--) {
      if (COMMON_WORDS.has(token.slice(i, i + len))) { matched = len; break }
    }
    if (matched === 0) return 0
    i += matched
    pieces++
  }
  return pieces
}

/** Reject example sentences whose words have run together: camelCase boundaries,
 *  over-long tokens, or a long token decomposing into 3+ common words. */
export function isCleanExample(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (/[a-z][A-Z]/.test(t)) return false
  for (const w of t.split(/\s+/)) {
    const letters = w.replace(/[^\p{L}]/gu, '')
    if (letters.length > 14) return false
    if (letters.length >= 11 && segmentCommon(letters.toLowerCase()) >= 3) return false
  }
  return true
}

/** Whether an example's translation is of the sentence rather than the entry's own gloss
 *  copied in: 30.4% of loaded Cambridge examples were that copy. Exact match, not a
 *  similarity score -- the bad rows are a copy, so nothing needs guessing. */
export function isSentenceTranslation(translation: string | null, glosses: (string | null)[]): boolean {
  // Both sides without a phrase's closing stop: the gloss reaches here with it stripped.
  const norm = (s: string | null | undefined) => (s ? stripPhraseStop(s.trim()).toLowerCase() : '')
  const t = norm(translation)
  if (!t) return false
  return !glosses.some((g) => norm(g) === t)
}

/** Whether a sentence holds a Latin-script token of `minLength`+ letters absent from
 *  `known`; Chinese is excluded because an unresolved character is ordinary. At 8,
 *  measured over 4,000 sentences per source: 1.9% of Cambridge, 2.2% of Tatoeba hidden. */
export function hasUnknownLongWord(segments: Segment[], known: Set<string>, minLength = 8): boolean {
  return segments.some((s) =>
    s.word && s.text.length >= minLength && /^\p{Script=Latin}+$/u.test(s.text) && !known.has(s.text.toLowerCase()))
}
