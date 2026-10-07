/**
 * The shapes of the theory content written by hand under `lib/theory/<lang>/`.
 *
 * Grammar points and the vocabulary lists come from the database; these four blocks do
 * not. They are a fixed, small body of editorial text, so they live in the repository as
 * typed constants: no migration to change a sentence, no query and no cache window on a
 * page that never varies, and the whole block is prerendered at build.
 */

/** A sentence and its Vietnamese translation. Every example in this section carries one:
 *  the reader is learning the language the example is written in. */
export interface Example {
  en: string
  vi: string
}

/** What learners actually write, what it should be, and why. `whyVi` states the rule in
 *  one line; the reader is looking at the pair, not reading an essay. */
export interface Mistake {
  wrong: string
  right: string
  whyVi: string
}

/** `weak` is the pair /i/ and /u/, which dictionaries print in unstressed syllables and
 *  which stand for a sound between a long and a short vowel rather than a phoneme of
 *  their own. */
export type PhonemeKind = 'vowel' | 'diphthong' | 'weak' | 'consonant'

export interface PhonemeExample {
  word: string
  ipa: string
  /** The letters in that word which make the sound, e.g. `ee` in `sheep`. */
  spelling: string
}

export interface Phoneme {
  /** The symbol learner dictionaries print, which is the one on our own entries. */
  symbol: string
  /** Only when General American writes the sound differently, e.g. `ɑː` against `ɒ`. */
  gaSymbol: string | null
  kind: PhonemeKind
  /** Row heading in the table: "Nguyên âm dài", "Phụ âm xát" and so on. */
  groupVi: string
  /** The lexical-set keyword, FLEECE or TRAP, which is how phonetics books name a vowel. */
  keyword: string
  /** Where the tongue and lips go, in one or two sentences. */
  howVi: string
  /** What a Vietnamese speaker tends to say instead. Null when there is no such trap. */
  trapVi: string | null
  /** The spellings that produce the sound, commonest first. */
  spellings: string[]
  examples: PhonemeExample[]
  /** Two words that differ only in this sound, for the ear to check itself. */
  minimalPair: { a: string; ipaA: string; b: string; ipaB: string } | null
}

/** Stress, weak forms, linking: what the table of single sounds cannot show. */
export interface PronunciationNote {
  id: string
  titleVi: string
  bodyVi: string
  examples: Example[]
}

export interface WordClassSubtype {
  titleVi: string
  explainVi: string
  examples: string[]
}

export interface WordClass {
  /** The key `posGroup` (`lib/dictionary/pos.ts`) gives a raw part of speech, so a word's
   *  own tag can link straight here. */
  key: string
  titleVi: string
  abbr: string
  /** One line: what the class is, in the reader's own words. */
  oneLineVi: string
  /** Where it sits in a sentence and what it attaches to. */
  roleVi: string
  /** The forms it changes into: plural, tense, comparative. Empty for classes that do
   *  not inflect. */
  forms: { titleVi: string; explainVi: string; examples: string[] }[]
  subtypes: WordClassSubtype[]
  mistakes: Mistake[]
  /** Keys of grammar points in `lex.grammar_points`, without the `en:` prefix. */
  grammarKeys: string[]
}

/** One topic on the sentence page: phrases, clauses, sentence types, word order. */
export interface SentenceTopic {
  id: string
  titleVi: string
  introVi: string
  items: {
    titleVi: string
    explainVi: string
    /** `S + V + O`, when the topic has a shape worth printing. */
    formula: string | null
    examples: Example[]
  }[]
  mistakes: Mistake[]
}

export interface CollocationPattern {
  id: string
  /** `V + N`, `Adj + N`, and so on. */
  formula: string
  titleVi: string
  explainVi: string
  examples: Example[]
  mistakes: Mistake[]
}

/** The pairs around one high-frequency verb, which is where collocation is learned:
 *  make a decision against do a decision. */
export interface CollocationSet {
  head: string
  titleVi: string
  noteVi: string
  items: Example[]
}

export type ToeicSection = 'listening' | 'reading'

/** A block of the guide that a part's own page repeats under its tips and traps. */
export type ToeicExtra = 'grammar' | 'paraphrase' | 'practice'

/** A strategy or a trap inside one part, with the sentence that shows it when there is one. */
export interface ToeicTip {
  titleVi: string
  bodyVi: string
  example: Example | null
}

/** One of the seven parts of the Listening and Reading test. */
export interface ToeicPart {
  number: number
  section: ToeicSection
  /** The name ETS prints in the test book, e.g. `Photographs`. */
  nameEn: string
  titleVi: string
  questions: number
  extras: readonly ToeicExtra[]
  /** What the test taker sees and hears, in one or two sentences. */
  formatVi: string
  tips: ToeicTip[]
  traps: ToeicTip[]
}

/** The lowest section scores ETS maps to a CEFR level. */
export interface ToeicCefrRow {
  level: string
  listening: number
  reading: number
}

/** A heading and the points under it: the score, the time budget, the plan, the day. */
export interface ToeicNote {
  id: string
  titleVi: string
  introVi: string
  points: string[]
}

/** A grammar point Part 5 and Part 6 test again and again. */
export interface ToeicGrammarItem {
  titleVi: string
  explainVi: string
  formula: string | null
  example: Example
  /** A key in `lex.grammar_points` without the `en:` prefix, for the full lesson. */
  grammarKey: string | null
}

/** What the audio or the passage says, and the reworded form the right option uses. */
export interface ToeicParaphrase {
  heard: string
  answer: string
  vi: string
}

/** Words of one workplace topic. Each `word` is a headword of the English dictionary,
 *  so it links to its entry, and `vi` is the sense the test uses. */
export interface ToeicWordTopic {
  id: string
  titleVi: string
  words: { word: string; vi: string }[]
}

export interface ToeicLink {
  titleVi: string
  url: string
  noteVi: string
}

/** A Part 5 item: one sentence, one gap, four options, as the test book prints it. */
export interface ToeicQuestion {
  id: string
  /** The sentence with its gap written `-------`. */
  sentence: string
  options: readonly [string, string, string, string]
  /** Index into `options`. */
  answer: number
  /** What the item tests, in two or three words. */
  skillVi: string
  whyVi: string
  /** The sentence with the answer in place, translated. */
  vi: string
}

export interface ToeicGuide {
  parts: readonly ToeicPart[]
  scoring: ToeicNote
  cefr: readonly ToeicCefrRow[]
  /** Rendered in order after the practice: time, plan, the last week, the day itself. */
  notes: readonly ToeicNote[]
  grammar: readonly ToeicGrammarItem[]
  paraphrases: readonly ToeicParaphrase[]
  wordTopics: readonly ToeicWordTopic[]
  /** The TOEIC Service List in frequency order, each word with its plain-English definition. */
  wordList: readonly (readonly [word: string, definition: string | null])[]
  practice: readonly ToeicQuestion[]
  links: readonly ToeicLink[]
}
