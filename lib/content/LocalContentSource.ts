import type { ContentSource } from './ContentSource'
import type { Language, Lesson, VocabItem, LangCode, LanguageContent } from './types'
import { validateLanguages, validateLanguageContent } from './schema'
import languagesJson from '@/content/languages.json'
import zhJson from '@/content/zh.json'
import esJson from '@/content/es.json'
import enJson from '@/content/en.json'

const languages: Language[] = validateLanguages(languagesJson)
const byLang: Record<LangCode, LanguageContent> = {
  zh: validateLanguageContent(zhJson),
  es: validateLanguageContent(esJson),
  en: validateLanguageContent(enJson),
}

const allVocab: VocabItem[] = Object.values(byLang).flatMap((c) => c.vocab)
const vocabById = new Map(allVocab.map((v) => [v.id, v]))
const allLessons: Lesson[] = Object.values(byLang).flatMap((c) => c.lessons)

const lessonsByLang: Record<LangCode, Lesson[]> = Object.fromEntries(
  Object.entries(byLang).map(([lang, c]) => [
    lang,
    [...c.lessons].sort((a, b) => a.position - b.position),
  ]),
) as Record<LangCode, Lesson[]>

export class LocalContentSource implements ContentSource {
  async getLanguages(): Promise<Language[]> {
    return languages
  }
  async getLessons(lang: LangCode): Promise<Lesson[]> {
    return lessonsByLang[lang] ?? []
  }
  async getLesson(lessonId: string): Promise<Lesson | null> {
    return allLessons.find((l) => l.id === lessonId) ?? null
  }
  async getVocab(ids: string[]): Promise<VocabItem[]> {
    return ids.map((id) => vocabById.get(id)).filter((v): v is VocabItem => Boolean(v))
  }
  async getVocabByLang(lang: LangCode): Promise<VocabItem[]> {
    return allVocab.filter((v) => v.lang === lang)
  }
}
