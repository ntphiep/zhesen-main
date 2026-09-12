import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { LangCode } from '@/lib/languages'
import type { Grade, SrsState } from '@/lib/progress/types'
import { cardStateFromDbValue, cardStateToDbValue, review } from '@/lib/progress/srs'
import { logActivityDay } from './activity'

/** A due wordlist entry plus its spaced-repetition state, ready to review. */
export interface ReviewCard {
  id: string
  lang: LangCode
  headword: string
  reading: string | null
  ipa: string | null
  meaningVi: string | null
  meaningEn: string | null
  example: string | null
  exampleTranslation: string | null
  audioUrl: string | null
  state: SrsState
}

const cardRowSchema = z.object({
  id: z.string(),
  lang: z.enum(['zh', 'es', 'en']),
  headword: z.string(),
  reading: z.string().nullable(),
  ipa: z.string().nullable(),
  meaning_vi: z.string().nullable(),
  meaning_en: z.string().nullable(),
  example: z.string().nullable(),
  example_translation: z.string().nullable(),
  audio_url: z.string().nullable(),
  fsrs_stability: z.number(),
  fsrs_difficulty: z.number(),
  fsrs_elapsed_days: z.number(),
  fsrs_scheduled_days: z.number(),
  fsrs_learning_steps: z.number(),
  fsrs_reps: z.number(),
  fsrs_lapses: z.number(),
  fsrs_state: z.number().int().min(0).max(3),
  fsrs_due_at: z.string(),
  fsrs_last_review_at: z.string().nullable(),
})
type CardRow = z.infer<typeof cardRowSchema>

const CARD_SELECT =
  'id, lang, headword, reading, ipa, meaning_vi, meaning_en, example, example_translation, audio_url, ' +
  'fsrs_stability, fsrs_difficulty, fsrs_elapsed_days, fsrs_scheduled_days, fsrs_learning_steps, fsrs_reps, ' +
  'fsrs_lapses, fsrs_state, fsrs_due_at, fsrs_last_review_at'

export function rowToCard(r: CardRow): ReviewCard {
  return {
    id: r.id, lang: r.lang, headword: r.headword, reading: r.reading, ipa: r.ipa,
    meaningVi: r.meaning_vi, meaningEn: r.meaning_en, example: r.example,
    exampleTranslation: r.example_translation, audioUrl: r.audio_url,
    state: {
      vocabId: r.id,
      stability: r.fsrs_stability,
      difficulty: r.fsrs_difficulty,
      elapsedDays: r.fsrs_elapsed_days,
      scheduledDays: r.fsrs_scheduled_days,
      learningSteps: r.fsrs_learning_steps,
      reps: r.fsrs_reps,
      lapses: r.fsrs_lapses,
      cardState: cardStateFromDbValue(r.fsrs_state),
      dueAt: Date.parse(r.fsrs_due_at),
      lastReviewedAt: r.fsrs_last_review_at ? Date.parse(r.fsrs_last_review_at) : null,
    },
  }
}

/** Cards whose next review is due at or before `now`, soonest first. RLS scopes to the user. */
export async function listDueCards(supabase: SupabaseClient, now: number, limit = 50): Promise<ReviewCard[]> {
  const { data, error } = await supabase
    .from('user_words')
    .select(CARD_SELECT)
    .lte('fsrs_due_at', new Date(now).toISOString())
    .order('fsrs_due_at', { ascending: true })
    .limit(limit)
  if (error) throw error
  return z.array(cardRowSchema).parse(data ?? []).map(rowToCard)
}

/** Number of wordlist cards currently due. RLS scopes to the user. */
export async function countDueCards(supabase: SupabaseClient, now: number = Date.now()): Promise<number> {
  const { count, error } = await supabase
    .from('user_words')
    .select('*', { count: 'exact', head: true })
    .lte('fsrs_due_at', new Date(now).toISOString())
  if (error) throw error
  return count ?? 0
}

/** Grade a card with FSRS and persist the new schedule. */
export async function gradeCard(supabase: SupabaseClient, card: ReviewCard, grade: Grade, now: number): Promise<SrsState> {
  const next = review(card.state, grade, now)
  const { error } = await supabase.from('user_words').update({
    fsrs_stability: next.stability,
    fsrs_difficulty: next.difficulty,
    fsrs_elapsed_days: next.elapsedDays,
    fsrs_scheduled_days: next.scheduledDays,
    fsrs_learning_steps: next.learningSteps,
    fsrs_reps: next.reps,
    fsrs_lapses: next.lapses,
    fsrs_state: cardStateToDbValue(next.cardState),
    fsrs_due_at: new Date(next.dueAt).toISOString(),
    fsrs_last_review_at: next.lastReviewedAt ? new Date(next.lastReviewedAt).toISOString() : null,
  }).eq('id', card.id)
  if (error) throw error
  // Record today's activity for the streak; never fail the grade over it.
  try { await logActivityDay(supabase, now) } catch { /* ignore */ }
  return next
}
