import type { Language, Lesson, VocabItem, LangCode } from './types'

export interface ContentSource {
  getLanguages(): Promise<Language[]>
  getLessons(lang: LangCode): Promise<Lesson[]>
  getLesson(lessonId: string): Promise<Lesson | null>
  getVocab(ids: string[]): Promise<VocabItem[]>
  getVocabByLang(lang: LangCode): Promise<VocabItem[]>
}
