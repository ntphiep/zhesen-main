import { shuffle, type Rand } from './shuffle'

/**
 * "Ghép cụm từ": a saved phrase with one word taken out, and four words to put back. The word
 * taken is the one learners get wrong: the particle of a phrasal verb (give _ up), the
 * light verb of a collocation (_ a decision: make, do, take, have) or the preposition of an
 * idiom (_ the spot: on, in, at, by). A choice that makes another dictionary phrase is
 * never offered, because give in or take a decision would be right too.
 */

const PARTICLES = ['up', 'out', 'off', 'down', 'in', 'on', 'over', 'away', 'back', 'through', 'about', 'around', 'along', 'apart', 'forward', 'aside']
const PREPOSITIONS = ['in', 'on', 'at', 'by', 'for', 'with', 'of', 'to', 'from', 'under', 'over', 'into', 'out of', 'off']
const LIGHT_VERBS = ['make', 'do', 'take', 'have', 'get', 'give', 'go', 'put', 'keep', 'set', 'come', 'pay', 'catch', 'break']

export interface PhraseGapSource {
  headword: string
  kind: string
}

export interface PhraseGap {
  before: string
  answer: string
  after: string
  options: string[]
}

/** The slot to blank and the words that may fill it, or null for a phrase with none. */
export function gapSlot(headword: string, kind: string): { at: number; pool: readonly string[] } | null {
  const words = headword.toLowerCase().trim().split(/\s+/)
  if (words.length < 2) return null
  if (kind === 'phrasal_verb') return PARTICLES.includes(words[1]) ? { at: 1, pool: PARTICLES } : null
  if (LIGHT_VERBS.includes(words[0])) return { at: 0, pool: LIGHT_VERBS }
  const prep = words.findIndex((w) => PREPOSITIONS.includes(w))
  return prep >= 0 ? { at: prep, pool: PREPOSITIONS } : null
}

/** Every phrase the slot's other fillers would make, to ask the dictionary which exist. */
export function rivalPhrases(headword: string, kind: string): string[] {
  const slot = gapSlot(headword, kind)
  if (!slot) return []
  const words = headword.trim().split(/\s+/)
  return slot.pool.filter((w) => w !== words[slot.at].toLowerCase())
    .map((w) => [...words.slice(0, slot.at), w, ...words.slice(slot.at + 1)].join(' '))
}

/** The question for one phrase; `existing` holds the lower-cased phrases the dictionary has. */
export function buildPhraseGap(src: PhraseGapSource, existing: ReadonlySet<string>, rand: Rand = Math.random): PhraseGap | null {
  const slot = gapSlot(src.headword, src.kind)
  if (!slot) return null
  const words = src.headword.trim().split(/\s+/)
  const answer = words[slot.at]
  const others = shuffle(slot.pool.filter((w) => w !== answer.toLowerCase()), rand)
    .filter((w) => !existing.has([...words.slice(0, slot.at), w, ...words.slice(slot.at + 1)].join(' ').toLowerCase()))
    .slice(0, 3)
  if (others.length < 2) return null
  return {
    before: words.slice(0, slot.at).join(' '),
    answer,
    after: words.slice(slot.at + 1).join(' '),
    options: shuffle([answer, ...others], rand),
  }
}
