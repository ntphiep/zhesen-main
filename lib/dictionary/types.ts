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
export interface DictEntryDetail extends DictEntryPreview {
  senses: DictSense[]
  pronunciations: DictPron[]
  examples: DictExample[]
  relations: DictRelation[]
  attributes: Record<string, unknown>
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
