import type { Segment } from '@/lib/reader/tokenize'
import type { DictSense } from './types'
import { cleanGlossTerm } from './crosslang'

/**
 * Heuristics for cleaning and selecting dictionary text before it reaches the UI:
 * machine-translation artifact stripping, which senses to show, Chinese CC-CEDICT
 * classifier glosses, and corrupted example sentences. Grouped together because
 * they're all "is this bit of text good enough to show, and if so which parts" --
 * matching how test/dictionary-detail-logic.test.ts already exercises them as one
 * unit.
 */

/**
 * Clean a machine-translated Vietnamese gloss of known MT artifacts. The pipeline's
 * MT glued a trailing NER label "Name" onto proper nouns ("Trung QuốcName" ->
 * "Trung Quốc", "Việt NamName" -> "Việt Nam"); strip it. If the gloss is still
 * garbled (an internal CamelCase boundary or a template leftover like
 * "Th3Ethiopian…LongName…"), return null so the caller falls back to the pivot or
 * the English gloss rather than showing junk.
 */
export function cleanMtGloss(gloss: string | null): string | null {
  if (!gloss) return null
  const t = gloss.replace(/(\p{L})Name(?=$|[\s;,)])/gu, '$1').trim()
  if (!t) return null
  if (/LongName|[A-Za-z]\d[A-Za-z]/.test(t)) return null // template / OCR-like leftovers
  if (/[a-zà-ỹ][A-Z]/u.test(t)) return null              // residual CamelCase boundary
  return t
}

/** Whether a sense carries any Vietnamese gloss (direct or via the English pivot). */
const hasVi = (s: DictSense): boolean => Boolean(s.glossVi || s.pivotVi)

/** Choose the most relevant senses to show, capped at `max`. The audience is
 * Vietnamese learners, so a sense that actually has a Vietnamese gloss (direct or
 * pivot-derived) is more useful than an English-only one; we sort Vietnamese
 * presence first, then by sense_order (the source's commonness order). */
export function pickSenses(senses: DictSense[], max = 3): { shown: DictSense[]; hiddenCount: number } {
  const sorted = [...senses].sort(
    (a, b) => (Number(hasVi(b)) - Number(hasVi(a))) || a.senseOrder - b.senseOrder,
  )
  return { shown: sorted.slice(0, max), hiddenCount: Math.max(0, senses.length - max) }
}

/** For non-English entries, derive a Vietnamese gloss for senses that lack one by
 * bridging through the English pivot: the sense's English gloss (e.g. zh 学习 ->
 * "to study") points at the English headword, whose Vietnamese gloss we reuse.
 * `viByTerm` maps a cleaned English term -> Vietnamese gloss. */
export function fillPivotVi(senses: DictSense[], viByTerm: Map<string, string>): DictSense[] {
  return senses.map((s) => {
    if (s.glossVi || !s.glossEn) return s
    const term = cleanGlossTerm(s.glossEn)
    const vi = term ? viByTerm.get(term) : undefined
    return vi ? { ...s, pivotVi: vi } : s
  })
}

/**
 * The Vietnamese meaning to show for an entry, wherever it came from.
 *
 * `detail.glossVi` is computed by `toPreview` before `withPivotVi` runs, and the
 * pivot writes to `sense.pivotVi` rather than back into the gloss. For a Chinese
 * or Spanish entry whose only Vietnamese meaning is pivoted through English --
 * which is most of them, and the reason the pivot exists -- `glossVi` is null
 * while the page is displaying a meaning. `SenseList` reads both; anything else
 * that wants "the meaning" has to as well, or it silently gets nothing.
 */
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

/** Pull the (simplified) classifier characters out of a CC-CEDICT "CL:" gloss.
 * Each entry is `traditional|simplified[pinyin]`; we keep the simplified form and
 * drop the bracketed pinyin. Returns [] for a non-classifier gloss. */
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

// Very common English words, used to detect a token that is several words run
// together (e.g. "Ilastsawher" = i+last+saw+her). Kept small and high-frequency so
// the check below rarely fires on a real long word.
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

/** Heuristic: reject example sentences whose words have run together (pipeline data
 * corruption). Catches camelCase boundaries, over-long tokens, and a long token that
 * fully decomposes into 3+ common words (e.g. "Ilastsawher"). */
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

/**
 * Whether an example's "translation" is really a translation of the sentence, or
 * the entry's own meaning copied into the field.
 *
 * The Cambridge crawler filled `translation_vi` from the sense gloss whenever the
 * page carried no per-example translation, which is nearly always: measured over
 * the loaded data, 30.4% of Cambridge examples carry the entry's meaning instead of
 * the sentence's. On the page that reads as a translation and it is not one -- under
 * "It's time to take the dog for a walk" it said "con chó".
 *
 * The comparison is exact rather than a similarity score: the bad rows are a copy,
 * so nothing is guessed, and a real translation that happens to equal a gloss is a
 * one-word sentence whose meaning the gloss already gave.
 */
export function isSentenceTranslation(translation: string | null, glosses: (string | null)[]): boolean {
  const t = translation?.trim().toLowerCase()
  if (!t) return false
  return !glosses.some((g) => g?.trim().toLowerCase() === t)
}

/**
 * Whether a sentence contains a long word the dictionary has never heard of.
 *
 * `isCleanExample` above catches run-together text with a hand-written list of
 * common words, and that list is the limit of it: "holyground." decomposes into two
 * ordinary English words that are not on it, so it went through and reached the page.
 * This check uses the dictionary instead. The page already resolved every token of
 * every example against `lex.entries` to make the words tappable, so the answer is
 * sitting in memory and costs nothing to ask.
 *
 * Eight letters, because the corruption joins two words and the join is what makes
 * the token long. Measured over a 20,000-example sample of the loaded English data,
 * against all 21,004 headwords plus all 41,939 inflected forms:
 *
 *   threshold   Cambridge sentences hidden   Tatoeba sentences hidden
 *      8                 77.7%                        6.4%
 *     11                 57.1%                        2.4%
 *     14                 35.5%                        0.5%
 *
 * Cambridge is the corrupted source; Tatoeba's text is clean, so its column is the
 * cost -- a good sentence hidden because the dictionary does not carry the word
 * ("breadfruit", "oceanographer", "hibernate"). Eight buys the most corruption
 * removed per good sentence lost, and an entry usually stores far more examples
 * than the six it shows, so the loss rarely reaches the page. The check costs
 * nothing once the crawler stops producing the corruption.
 *
 * Latin scripts only -- a Chinese token that resolves to nothing is an ordinary
 * character, handled by the character lookup.
 */
export function hasUnknownLongWord(segments: Segment[], known: Set<string>, minLength = 8): boolean {
  return segments.some((s) =>
    s.word && s.text.length >= minLength && /^\p{Script=Latin}+$/u.test(s.text) && !known.has(s.text.toLowerCase()))
}

/** How many examples an entry page shows. */
export const MAX_EXAMPLES = 6

/** The examples a page will actually render. Shared between the list and the
 * server-side resolver so both work from the same set: resolving a text the list
 * then drops is wasted, and rendering one the resolver skipped shows nothing. */
export function pickExamples<T extends { text: string }>(examples: T[]): T[] {
  return examples.filter((e) => isCleanExample(e.text)).slice(0, MAX_EXAMPLES)
}
