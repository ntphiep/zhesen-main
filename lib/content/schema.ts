import { z } from 'zod'
import type { Language, LanguageContent } from './types'

const langCode = z.enum(['zh', 'es', 'en'])

const languageSchema = z.object({
  code: langCode,
  name: z.string().min(1),
  nativeName: z.string().min(1),
  script: z.enum(['han', 'latin']),
})

const translationSchema = z.object({ vi: z.string().min(1) })

const exampleSchema = z.object({
  sentence: z.string().min(1),
  reading: z.string().optional(),
  translation: translationSchema,
})

const vocabSchema = z.object({
  id: z.string().min(1),
  lang: langCode,
  term: z.string().min(1),
  reading: z.string().optional(),
  translation: translationSchema,
  partOfSpeech: z.string().optional(),
  level: z.string().optional(),
  examples: z.array(exampleSchema).optional(),
  audio: z.string().optional(),
})

const lessonSchema = z.object({
  id: z.string().min(1),
  lang: langCode,
  title: z.string().min(1),
  description: z.string(),
  position: z.number().int().nonnegative(),
  vocabIds: z.array(z.string().min(1)),
})

const contentSchema = z.object({
  lessons: z.array(lessonSchema),
  vocab: z.array(vocabSchema),
})

export function validateLanguages(data: unknown): Language[] {
  return z.array(languageSchema).parse(data)
}

export function validateLanguageContent(data: unknown): LanguageContent {
  return contentSchema.parse(data)
}
