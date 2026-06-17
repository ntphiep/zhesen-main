import { z } from 'zod'
import type { Language, Lesson, VocabItem } from './types'

const langCode = z.enum(['zh', 'es', 'en'])
const translation = z.object({ vi: z.string().min(1) })

const exampleSchema = z.object({
  sentence: z.string().min(1),
  reading: z.string().optional(),
  translation: z.object({ vi: z.string().min(1) }),
})

const languageRow = z.object({
  code: langCode,
  name: z.string().min(1),
  native_name: z.string().min(1),
  script: z.enum(['han', 'latin']),
})

const vocabRow = z.object({
  id: z.string().min(1),
  lang: langCode,
  term: z.string().min(1),
  reading: z.string().nullable(),
  translation,
  part_of_speech: z.string().nullable(),
  level: z.string().nullable(),
  examples: z.array(exampleSchema).nullable(),
  audio: z.string().nullable(),
})

const lessonRow = z.object({
  id: z.string().min(1),
  lang: langCode,
  title: z.string().min(1),
  description: z.string(),
  position: z.number().int().positive(),
})

export function parseLanguageRow(r: unknown): Language {
  const x = languageRow.parse(r)
  return { code: x.code, name: x.name, nativeName: x.native_name, script: x.script }
}

export function parseVocabRow(r: unknown): VocabItem {
  const x = vocabRow.parse(r)
  return {
    id: x.id,
    lang: x.lang,
    term: x.term,
    reading: x.reading ?? undefined,
    translation: x.translation,
    partOfSpeech: x.part_of_speech ?? undefined,
    level: x.level ?? undefined,
    examples: x.examples ?? undefined,
    audio: x.audio ?? undefined,
  }
}

export function parseLessonRow(r: unknown): Omit<Lesson, 'vocabIds'> {
  const x = lessonRow.parse(r)
  return {
    id: x.id,
    lang: x.lang,
    title: x.title,
    description: x.description,
    position: x.position,
  }
}
