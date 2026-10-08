import type { LangCode } from '@/lib/languages'

export interface DictSense {
  pos: string | null
  glossVi: string | null
  glossEn: string | null
  senseOrder: number
  /** Vietnamese gloss derived via the English pivot, set only when glossVi is absent.
   *  Must be shown with a "qua tiếng Anh" marker, not as a direct translation. */
  pivotVi?: string | null
  /** `lex.senses.id`; present on an entry page's senses, which examples link to. */
  id?: string
  /** Rank of a core sense within its part of speech, 1 most common; null when unranked. */
  senseFrequency?: number | null
  /** `lex.senses.gloss_vi_is_mt`: `glossVi` is a machine translation. Read on the entry page only. */
  glossViIsMt?: boolean
  /** `lex.senses.provenance->>'gloss_vi_source'`, as `mt:google`. Read on the entry page only. */
  glossViSource?: string | null
  /** `lex.senses.register`, Wiktionary's comma-joined tags such as `obsolete,rare`. Read on the entry page only. */
  register?: string | null
}
export interface DictPron {
  accent: string
  ipa: string | null
  audioUrl: string | null
}
export interface DictExample {
  text: string
  reading: string | null
  translationVi: string | null
  translationEn: string | null
  /** The sense this sentence illustrates (`lex.examples.sense_id`); null when unlinked. */
  senseId?: string | null
  /** `lex.examples.source_id`, the dataset the sentence came from. Read on the entry page only. */
  sourceId?: string | null
}
export interface DictRelation {
  relationType: string
  relatedText: string | null
  relatedEntryId: string | null
}
export interface DictEntryPreview {
  id: string
  lang: LangCode
  headword: string
  traditional: string | null
  level: string | null
  /** `lex.entries.level_is_estimated`, present only when true: every Spanish level and the
   *  frequency-filled English ones are Zhesen's estimate, not a CEFR list. */
  levelIsEstimated?: true
  ipa: string | null
  pos: string | null
  glossVi: string | null
  glossEn: string | null
  audioUrl: string | null
  /** Pinyin, for a Chinese row that came from a source carrying it. */
  reading?: string | null
  /** Corpus frequency rank (1 = most frequent); null when unknown. */
  frequencyRank?: number | null
  /** How well this entry matched the query, from `lex.search`. Present only on search
   *  results, so a caller can compare matches across languages. */
  matchScore?: number | null
}
/** A common-words chip on `/dictionary`. */
export type DictEntryChip = Pick<DictEntryPreview, 'id' | 'headword' | 'glossVi'>
export interface DictEntryDetail extends DictEntryPreview {
  senses: DictSense[]
  pronunciations: DictPron[]
  examples: DictExample[]
  relations: DictRelation[]
  attributes: Record<string, unknown>
  /** The synonyms that belong to one sense, from `lex.relation_senses`; absent or empty
   *  when none matched or the call failed. */
  senseLinks?: SenseLink[]
  /** Null when the entry has no notes; absent outside the entry page. */
  notes?: EntryNotes | null
  /** Sentence patterns with their Vietnamese; absent outside the entry page. */
  patterns?: SentencePattern[]
}

/** One row of `lex.entry_patterns` (migration 0199): "accuse sb of sth", "buộc tội ai về việc gì". */
export interface SentencePattern {
  pattern: string
  vi: string
  example: string | null
  exampleVi: string | null
}
/** How one ancestor of a word relates to the next: inherited, derived, borrowed, borrowed by
 *  scholars, or translated part by part. */
export type OriginRel = 'inh' | 'der' | 'bor' | 'lbor' | 'calque'

export interface OriginStep {
  rel: OriginRel
  /** Wiktionary language code, e.g. `enm`, `la-med`. */
  lang: string
  /** The language's English name, for a code `lib/dictionary/origin.ts` does not name. */
  name?: string
  word: string
  gloss?: string
  /** Latin-script reading of a word in another script. */
  tr?: string
}

export interface OriginPart {
  word: string
  gloss?: string
  /** The part is an English entry. */
  e?: true
}

export type OriginKind = 'clipping' | 'back-formation' | 'onomatopoeia' | 'coinage'

/** One etymology of a word, from `lex.entry_notes.origin` (migration 0198). */
export interface Origin {
  /** The parts of speech, as `lex.senses.pos` spells them, this etymology covers. */
  pos: string[]
  /** Ancestors, nearest first. */
  chain: OriginStep[]
  parts?: OriginPart[]
  /** `e`: the word it was made from is an English entry. */
  kind?: { type: OriginKind; word?: string; e?: true; by?: string; year?: string }
  doublets?: string[]
}

/** `lex.entry_notes` (migration 0198): what Wiktionary says about the word beyond its senses. */
export interface EntryNotes {
  origins: Origin[]
  /** Grammar labels by `lex.senses.id`: `uncountable`, `transitive`, `with to`. */
  senseGrammar: Record<string, string[]>
}
export interface SenseLink {
  text: string
  /** `lex.senses.sense_order` of the headword sense the synonym shares a term with. */
  senseOrder: number
  /** The entry the synonym resolves to. */
  targetId: string
}
/** A "did you mean...?" candidate from `lex.suggest`
 *  (supabase/migrations/0018_reverse_lookup.sql), for a query with zero direct hits. */
export interface SuggestionPreview {
  id: string
  lang: LangCode
  headword: string
  glossVi: string | null
  /** Which side of the entry the trigram matched. A lookup panel only offers the side it
   *  searches: a Vietnamese query answered with a Spanish headword reads as nonsense. */
  kind: 'headword' | 'gloss_vi'
}
/** A longer entry that contains the word being looked at: 学 -> 学生, water -> water down.
 *  See supabase/migrations/0025_entries_containing.sql. */
export interface ContainingWord {
  id: string
  lang: LangCode
  headword: string
  traditional: string | null
  level: string | null
  glossVi: string | null
  glossEn: string | null
}

export interface CrossLangSibling {
  id: string
  lang: LangCode
  headword: string
  /** Pinyin for a Chinese equivalent; null for the Latin-script languages. */
  reading: string | null
  /** Raw gender code from the data ('m', 'f'); Spanish only. */
  gender: string | null
  pos: string | null
  glossVi: string | null
  glossEn: string | null
}
export interface WordForm {
  formText: string
  formLabel: string | null
}
/** What the dictionary knows about a word stored only as text elsewhere: a synonym in
 *  `lex.lex_relations`, an inflected form in `lex.inflections`. See
 *  `lex.term_previews` (supabase/migrations/0027). */
export interface TermPreview {
  /** The surface form asked about, so the caller can match it back. */
  matchText: string
  id: string
  headword: string
  pos: string | null
  ipa: string | null
  reading: string | null
  gender: string | null
  glossVi: string | null
  glossEn: string | null
}
export interface CharInfo {
  char: string
  radical: string | null
  strokeCount: number | null
  hanViet: string[]
  pinyin: string[]
  gloss: string | null
}
