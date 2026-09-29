import { z } from '@/lib/zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { LangCode } from '@/lib/languages'
import type { Grade, SrsState } from '@/lib/progress/types'
import { cardStateFromDbValue, cardStateToDbValue, review } from '@/lib/progress/srs'
import { stripPhraseStop } from '@/lib/dictionary/textQuality'

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
  /** The dictionary entry the word was saved from. Absent where a caller builds a card by hand. */
  entryId?: string | null
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
  entry_id: z.string().nullable().optional(),
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
  'id, lang, headword, reading, ipa, meaning_vi, meaning_en, example, example_translation, audio_url, entry_id, ' +
  'fsrs_stability, fsrs_difficulty, fsrs_elapsed_days, fsrs_scheduled_days, fsrs_learning_steps, fsrs_reps, ' +
  'fsrs_lapses, fsrs_state, fsrs_due_at, fsrs_last_review_at'

export function rowToCard(r: CardRow): ReviewCard {
  return {
    id: r.id, lang: r.lang, headword: r.headword, reading: r.reading, ipa: r.ipa,
    meaningVi: r.meaning_vi && stripPhraseStop(r.meaning_vi), meaningEn: r.meaning_en, example: r.example,
    exampleTranslation: r.example_translation, audioUrl: r.audio_url, entryId: r.entry_id ?? null,
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

export interface DueOptions {
  /** Most cards in one session. */
  limit?: number
  /** Most never-seen cards in one session. */
  newLimit?: number
}

/** The session size. One constant, because `countDueCards` promises what
 *  `listDueCards` will hand over, and two copies of these numbers drift. */
export const SESSION_LIMITS = { limit: 50, newLimit: 20 } as const

/** The session queue: due cards already being learned, then a bounded number never seen.
 *  The two must stay split -- a new card is due the moment it is saved, so 404 of one
 *  account's 407 cards were due at once and one flat query buried the real reviews.
 *  Twenty new cards is Anki's default daily allowance. */
export async function listDueCards(
  supabase: SupabaseClient, now: number, options: DueOptions = {},
): Promise<ReviewCard[]> {
  const { limit = SESSION_LIMITS.limit, newLimit = SESSION_LIMITS.newLimit } = options
  const dueBy = new Date(now).toISOString()

  const page = (fresh: boolean, take: number) =>
    supabase
      .from('user_words')
      .select(CARD_SELECT)
      .lte('fsrs_due_at', dueBy)
      .filter('fsrs_reps', fresh ? 'eq' : 'gt', 0)
      .order('fsrs_due_at', { ascending: true })
      .limit(take)

  const { data: reviews, error: reviewError } = await page(false, limit)
  if (reviewError) throw reviewError
  const learned = z.array(cardRowSchema).parse(reviews ?? []).map(rowToCard)

  const room = Math.min(newLimit, limit - learned.length)
  if (room <= 0) return learned

  const { data: fresh, error: freshError } = await page(true, room)
  if (freshError) throw freshError
  return [...learned, ...z.array(cardRowSchema).parse(fresh ?? []).map(rowToCard)]
}

/** How many cards the next session will hand over (RLS scopes to the user). Must use the
 *  queue's own formula, not a flat COUNT of due rows, or the button claims work the session
 *  will not hand over. Two head-only COUNTs, so it costs about what one flat COUNT did. */
export async function countDueCards(
  supabase: SupabaseClient, now: number = Date.now(), options: DueOptions = {},
): Promise<number> {
  const { limit = SESSION_LIMITS.limit, newLimit = SESSION_LIMITS.newLimit } = options
  const dueBy = new Date(now).toISOString()

  const countBy = async (fresh: boolean): Promise<number> => {
    const { count, error } = await supabase
      .from('user_words')
      .select('*', { count: 'exact', head: true })
      .lte('fsrs_due_at', dueBy)
      .filter('fsrs_reps', fresh ? 'eq' : 'gt', 0)
    if (error) throw error
    return count ?? 0
  }

  // Both at once: in sequence this puts a second round trip to Seoul on the critical path
  // of /wordlist and /practice, neither of which can be cached at all.
  const [reviewDue, freshDue] = await Promise.all([countBy(false), countBy(true)])
  const learned = Math.min(reviewDue, limit)
  const room = Math.min(newLimit, limit - learned)
  if (room <= 0) return learned
  return learned + Math.min(room, freshDue)
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
  return next
}

/** Grade a saved word by id, reading its schedule first. The practice modes work from
 *  `listWords`, which carries no scheduling state, so they cannot call `gradeCard`.
 *  Returns null when the row is gone -- deleted in another tab is not an error. */
export async function gradeWordById(
  supabase: SupabaseClient, id: string, grade: Grade, now: number = Date.now(),
): Promise<SrsState | null> {
  const { data, error } = await supabase.from('user_words').select(CARD_SELECT).eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) return null
  return gradeCard(supabase, rowToCard(cardRowSchema.parse(data)), grade, now)
}
