import { z } from '@/lib/zod'
import type { LangCode } from '@/lib/languages'

export type WordStatus = 'new' | 'learning' | 'known'

/** The label shown for each status, in the order they are offered to the user.
 * Typed as a full Record, so a new status cannot compile until it has a label. */
export const STATUS_LABELS: Record<WordStatus, string> = {
  new: 'Mới',
  learning: 'Đang học',
  known: 'Đã biết',
}

/** A word missed this often needs a different approach, not more repetitions. Anki's leech
 *  threshold is eight; this list is reviewed far less often, so three is already the signal. */
export const LEECH_LAPSES = 3

/** Entries of STATUS_LABELS with the key still typed, for rendering option lists. */
export const STATUS_OPTIONS = Object.entries(STATUS_LABELS) as [WordStatus, string][]

/** Fields "Điền bằng AI" fills. A word lists those still holding the model's text, until
 *  the learner edits them, so the notebook can label them. */
export const AI_FIELDS = ['meaningVi', 'ipa', 'pos', 'level', 'example', 'exampleTranslation'] as const
export type AiField = (typeof AI_FIELDS)[number]

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
  /** When the scheduler wants this word back. Read-only here: practice writes the
   *  FSRS columns, the wordlist only sorts and filters by them. */
  fsrsDueAt: string
  /** How many times the word has been forgotten after being learnt. Anki calls a
   *  card with a high count a leech; here it is what "Hay sai" filters on. */
  fsrsLapses: number
  /** Absent when no field came from the assistant. */
  aiFields?: AiField[]
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
  aiFields?: AiField[]
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
  fsrs_due_at: z.string(),
  fsrs_lapses: z.number(),
  /** Column names; absent before migration 0182. */
  ai_fields: z.array(z.string()).nullish(),
})
