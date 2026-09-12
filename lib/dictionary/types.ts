import type { LangCode } from '@/lib/languages'

export interface DictSense {
  pos: string | null
  glossVi: string | null
  glossEn: string | null
  senseOrder: number
  /** Vietnamese gloss derived via the English pivot (zh/es entry whose gloss_en
   * points at an English headword that has a Vietnamese gloss). Set only when
   * glossVi is absent; shown with a "qua tiếng Anh" marker so it is not mistaken
   * for a curated direct translation. */
  pivotVi?: string | null
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
  /** Corpus frequency rank (1 = most frequent); null when unknown. */
  frequencyRank?: number | null
  /** How well this entry matched the query, from `lex.search`. Present only on
   * search results, so a caller can compare matches across languages. */
  matchScore?: number | null
}
export interface DictEntryDetail extends DictEntryPreview {
  senses: DictSense[]
  pronunciations: DictPron[]
  examples: DictExample[]
  relations: DictRelation[]
  attributes: Record<string, unknown>
}
/** A "did you mean...?" candidate from `lex.suggest` (see
 * supabase/migrations/0018_reverse_lookup.sql): the trigram-nearest headword or
 * Vietnamese gloss to a query that had zero direct hits in either direction. */
export interface SuggestionPreview {
  id: string
  lang: LangCode
  headword: string
  glossVi: string | null
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
/** What the dictionary knows about a word that is only stored as text elsewhere:
 *  a synonym in `lex.lex_relations`, an inflected form in `lex.inflections`.
 *  See `lex.term_previews` (supabase/migrations/0027). */
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
