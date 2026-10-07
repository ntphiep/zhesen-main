import type { LangCode } from '@/lib/languages'
import type {
  CollocationPattern,
  CollocationSet,
  Phoneme,
  PronunciationNote,
  SentenceTopic,
  ToeicGuide,
  ToeicPart,
  ToeicWordTopic,
  WordClass,
} from './types'
import { hasBlock } from './blocks'
import { PHONEMES, PRONUNCIATION_NOTES } from './en/pronunciation'
import { WORD_CLASSES } from './en/wordClasses'
import { SENTENCE_TOPICS } from './en/sentence'
import { COLLOCATION_PATTERNS, COLLOCATION_SETS } from './en/collocation'
import { TOEIC_GUIDE } from './en/toeic'

export interface TheoryContent {
  phonemes: readonly Phoneme[]
  pronunciationNotes: readonly PronunciationNote[]
  wordClasses: readonly WordClass[]
  sentenceTopics: readonly SentenceTopic[]
  collocationPatterns: readonly CollocationPattern[]
  collocationSets: readonly CollocationSet[]
  toeic: ToeicGuide
}

/** English only for now. A language with no entry here shows the two blocks that come
 *  from the dictionary and nothing else; the hub is built from the same fact
 *  (`BLOCKS_BY_LANG`). */
const CONTENT: Partial<Record<LangCode, TheoryContent>> = {
  en: {
    phonemes: PHONEMES,
    pronunciationNotes: PRONUNCIATION_NOTES,
    wordClasses: WORD_CLASSES,
    sentenceTopics: SENTENCE_TOPICS,
    collocationPatterns: COLLOCATION_PATTERNS,
    collocationSets: COLLOCATION_SETS,
    toeic: TOEIC_GUIDE,
  },
}

export function theoryContent(lang: LangCode): TheoryContent | undefined {
  return CONTENT[lang]
}

export function findWordClass(lang: LangCode, key: string): WordClass | undefined {
  return theoryContent(lang)?.wordClasses.find((c) => c.key === key)
}

/** The TOEIC guide of a language whose hub shows the block. */
export function toeicGuide(lang: LangCode): ToeicGuide | undefined {
  return hasBlock(lang, 'toeic') ? theoryContent(lang)?.toeic : undefined
}

export function findToeicTopic(lang: LangCode, id: string): ToeicWordTopic | undefined {
  return toeicGuide(lang)?.wordTopics.find((t) => t.id === id)
}

/** Words per page of the TOEIC list: a sitting's worth, and a cold page reads each one. */
export const TOEIC_GROUP_SIZE = 25

export function toeicGroupCount(lang: LangCode): number {
  return Math.ceil((toeicGuide(lang)?.wordList.length ?? 0) / TOEIC_GROUP_SIZE)
}

/** One page of the TOEIC list, numbered from 1. Exact text match, so `01` has no second URL. */
export function findToeicGroup(lang: LangCode, group: string): { n: number; words: ToeicGuide['wordList'] } | undefined {
  const list = toeicGuide(lang)?.wordList
  if (!list || !/^[1-9][0-9]*$/.test(group)) return undefined
  const n = Number(group)
  const words = list.slice((n - 1) * TOEIC_GROUP_SIZE, n * TOEIC_GROUP_SIZE)
  return words.length ? { n, words } : undefined
}

const toeicRanks = new Map<LangCode, Map<string, number>>()

/** A headword's rank in the TOEIC list, from 1, and the page of the list that shows it. */
export function toeicPlace(lang: LangCode, headword: string): { rank: number; group: number } | null {
  let ranks = toeicRanks.get(lang)
  if (!ranks) {
    ranks = new Map()
    for (const [i, [word]] of (toeicGuide(lang)?.wordList ?? []).entries()) if (!ranks.has(word)) ranks.set(word, i + 1)
    toeicRanks.set(lang, ranks)
  }
  const rank = ranks.get(headword)
  return rank ? { rank, group: Math.ceil(rank / TOEIC_GROUP_SIZE) } : null
}

/** Exact text match, so `05` is not Part 5 and has no second URL. */
export function findToeicPart(lang: LangCode, part: string): ToeicPart | undefined {
  return toeicGuide(lang)?.parts.find((p) => String(p.number) === part)
}
