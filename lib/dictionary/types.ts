import type { LangCode } from '@/lib/content/types'

export interface DictSense {
  pos: string | null
  glossVi: string | null
  glossEn: string | null
  senseOrder: number
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
