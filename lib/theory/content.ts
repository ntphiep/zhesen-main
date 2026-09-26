import type { LangCode } from '@/lib/languages'
import type {
  CollocationPattern,
  CollocationSet,
  Phoneme,
  PronunciationNote,
  SentenceTopic,
  ToeicGuide,
  WordClass,
} from './types'
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
