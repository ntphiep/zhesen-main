export type LangCode = 'zh' | 'es' | 'en'
export type Script = 'han' | 'latin'

export interface Language {
  code: LangCode
  name: string       // Vietnamese display name, e.g. "Tiếng Trung"
  nativeName: string // e.g. "中文"
  script: Script
}

export interface Example {
  sentence: string
  reading?: string
  translation: { vi: string }
}

export interface VocabItem {
  id: string
  lang: LangCode
  term: string
  reading?: string
  translation: { vi: string }
  partOfSpeech?: string
  level?: string
  examples?: Example[]
  audio?: string
}

export interface Lesson {
  id: string
  lang: LangCode
  title: string
  description: string
  position: number
  vocabIds: string[]
}

export interface LanguageContent {
  lessons: Lesson[]
  vocab: VocabItem[]
}
