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
}
export interface DictEntryDetail extends DictEntryPreview {
  senses: DictSense[]
  pronunciations: DictPron[]
  examples: DictExample[]
  relations: DictRelation[]
  attributes: Record<string, unknown>
}
export interface CrossLangSibling {
  id: string
  lang: LangCode
  headword: string
  glossVi: string | null
  glossEn: string | null
}
export interface WordForm {
  formText: string
  formLabel: string | null
}
export interface CharInfo {
  char: string
  radical: string | null
  strokeCount: number | null
  hanViet: string[]
  pinyin: string[]
  gloss: string | null
}
