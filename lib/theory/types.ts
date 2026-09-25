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
