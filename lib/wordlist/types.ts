import { z } from 'zod'
import type { LangCode } from '@/lib/languages'

export type WordStatus = 'new' | 'learning' | 'known'

export interface UserWord {
  id: string
  lang: LangCode
  entryId: string | null
  headword: string
  reading: string | null
  ipa: string | null
  pos: string | null
  meaningVi: string | null
  meaningEn: string | null
  level: string | null
  example: string | null
  exampleTranslation: string | null
  audioUrl: string | null
  notes: string | null
  status: WordStatus
  tags: string[]
  createdAt: string
  updatedAt: string
}

/** Fields the user supplies when creating/editing a word (excludes id/timestamps/user_id). */
export interface WordDraft {
  lang: LangCode
  entryId: string | null
  headword: string
  reading: string | null
  ipa: string | null
  pos: string | null
  meaningVi: string | null
  meaningEn: string | null
  level: string | null
  example: string | null
  exampleTranslation: string | null
  audioUrl: string | null
  notes: string | null
  status: WordStatus
  tags: string[]
}

export const userWordRow = z.object({
  id: z.string(),
  lang: z.enum(['zh', 'es', 'en']),
  entry_id: z.string().nullable(),
  headword: z.string().min(1),
  reading: z.string().nullable(),
  ipa: z.string().nullable(),
  pos: z.string().nullable(),
  meaning_vi: z.string().nullable(),
  meaning_en: z.string().nullable(),
  level: z.string().nullable(),
  example: z.string().nullable(),
  example_translation: z.string().nullable(),
  audio_url: z.string().nullable(),
  notes: z.string().nullable(),
  status: z.enum(['new', 'learning', 'known']),
  tags: z.array(z.string()),
  created_at: z.string(),
  updated_at: z.string(),
})
