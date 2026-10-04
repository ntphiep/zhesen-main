import type { Segment } from '@/lib/reader/tokenize'
import type { DictEntryPreview } from './types'

/**
 * Multi-word entries inside a passage: "I gave up smoking" holds give up, which the word
 * list splits into give and up, two words that each mean something else. Every run of two
 * to six words is a candidate, and so is a verb, an object pronoun and a particle ("gave
 * it up"), asked for without the pronoun. The dictionary answers which candidates are
 * entries; `lex.inflections` holds the forms of a phrase too, so "gave up" reaches give up.
 */

/** "at the end of the day" is six words. */
const MAX_WORDS = 6

/** Words that make no phrase on their own: "of the" and "it is" are not entries a learner
 *  needs pointed out, and a candidate made only of these is not asked for. */
const FUNCTION_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'as',
  'is', 'are', 'was', 'were', 'be', 'been', 'am', 'do', 'does', 'did', 'have', 'has', 'had', 'it', 'its', 'i',
  'you', 'he', 'she', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'our', 'their', 'this',
  'that', 'these', 'those', 'there', 'not', 'so', 'than', 'then', 'up', 'out', 'off', 'down', 'over', 'into',
])

/** The object a separable phrasal verb takes between its verb and its particle. */
const OBJECT_PRONOUNS = new Set(['it', 'him', 'her', 'them', 'me', 'us', 'you', 'this', 'that'])

/** A subject after one of these is a question's ("can you tell me how"), never the start of
 *  an idiom such as "you tell me", which means "I don't know". */
const SUBJECTS = new Set(['i', 'you', 'he', 'she', 'it', 'we', 'they'])
const AUXILIARIES = new Set([
  'can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must', 'do', 'does', 'did',
  'is', 'are', 'was', 'were', 'am', 'have', 'has', 'had',
])

/** Wiktionary's sum-of-parts entries, such as play in: "Used other than figuratively or
 *  idiomatically: see play, in." */
const SUM_OF_PARTS = /^used other than figuratively or idiomatically/i

const PARTICLES = new Set([
  'up', 'down', 'in', 'out', 'on', 'off', 'over', 'away', 'back', 'about', 'along', 'around', 'round', 'aside',
  'through', 'by', 'apart', 'together', 'forward',
])

/** What follows the verb in a phrasal or prepositional verb: take up, look after, put up
 *  with. */
export const PHRASAL_PARTICLES: readonly string[] = [
  ...PARTICLES, 'after', 'under', 'for', 'to', 'with', 'into', 'onto', 'upon', 'across', 'ahead', 'behind', 'past',
  'of', 'at', 'from',
]
const PHRASAL_SET = new Set(PHRASAL_PARTICLES)

/** The particles after `verb` when `phrase` is that verb plus one or two of them ("up",
 *  "forward to", "up with"), as written; null for anything else, "take care" included. */
export function phrasalTail(verb: string, phrase: string): string | null {
  const prefix = `${verb.toLowerCase()} `
  if (!phrase.toLowerCase().startsWith(prefix)) return null
  const tail = phrase.slice(prefix.length)
  const words = tail.toLowerCase().split(' ')
  return words.length <= 2 && words.every((w) => PHRASAL_SET.has(w)) ? tail : null
}

export interface PhraseCandidate {
  /** What the dictionary is asked for: the words lowercased, a pronoun object left out. */
  key: string
  /** The span as written. */
  text: string
  /** The first and last word the span covers, counted over the passage's words. */
  first: number
  last: number
}

/** English candidates, in passage order. Words joined by punctuation are never one
 *  phrase: "up. Then" ends a sentence between them. */
export function phraseCandidates(segments: Segment[]): PhraseCandidate[] {
  const words: string[] = []
  // Whether the word at this index follows the previous one across whitespace alone.
  const joined: boolean[] = []
  let gap = ''
  for (const s of segments) {
    if (!s.word) { gap += s.text; continue }
    joined.push(words.length > 0 && /^\s+$/.test(gap))
    words.push(s.text)
    gap = ''
  }
  const lower = words.map((w) => w.toLowerCase())
  const out: PhraseCandidate[] = []
  for (let i = 0; i < words.length; i++) {
    if (SUBJECTS.has(lower[i]) && i > 0 && joined[i] && AUXILIARIES.has(lower[i - 1])) continue
    for (let n = 2; n <= MAX_WORDS && i + n <= words.length; n++) {
      if (!joined[i + n - 1]) break
      const span = lower.slice(i, i + n)
      if (span.every((w) => FUNCTION_WORDS.has(w))) continue
      out.push({ key: span.join(' '), text: words.slice(i, i + n).join(' '), first: i, last: i + n - 1 })
    }
    if (i + 2 < words.length && joined[i + 1] && joined[i + 2] && !FUNCTION_WORDS.has(lower[i])
      && OBJECT_PRONOUNS.has(lower[i + 1]) && PARTICLES.has(lower[i + 2])) {
      out.push({ key: `${lower[i]} ${lower[i + 2]}`, text: words.slice(i, i + 3).join(' '), first: i, last: i + 2 })
    }
  }
  return out
}

export interface FoundPhrase {
  /** The words as written, which may be a form of the headword: "gave it up". */
  text: string
  entry: DictEntryPreview
}

/** The candidates the dictionary holds as multi-word entries with a Vietnamese meaning,
 *  longest first where two overlap, then in reading order, each entry once. want to and go
 *  to are entries with no Vietnamese, and play in is a sum-of-parts entry. */
export function pickPhrases(candidates: PhraseCandidate[], found: Map<string, DictEntryPreview>): FoundPhrase[] {
  const hits = candidates
    .map((c) => ({ c, entry: found.get(c.key) }))
    .filter((h): h is { c: PhraseCandidate; entry: DictEntryPreview } => !!h.entry && /\s/.test(h.entry.headword.trim())
      && Boolean(h.entry.glossVi?.trim()) && !SUM_OF_PARTS.test(h.entry.glossEn?.trim() ?? ''))
    .sort((a, b) => (b.c.last - b.c.first) - (a.c.last - a.c.first) || a.c.first - b.c.first)
  const covered = new Set<number>()
  const picked: { c: PhraseCandidate; entry: DictEntryPreview }[] = []
  for (const h of hits) {
    const span = Array.from({ length: h.c.last - h.c.first + 1 }, (_, k) => h.c.first + k)
    if (span.some((k) => covered.has(k))) continue
    span.forEach((k) => covered.add(k))
    picked.push(h)
  }
  const seen = new Set<string>()
  return picked
    .sort((a, b) => a.c.first - b.c.first)
    .filter((h) => !seen.has(h.entry.id) && seen.add(h.entry.id))
    .map((h) => ({ text: h.c.text, entry: h.entry }))
}
