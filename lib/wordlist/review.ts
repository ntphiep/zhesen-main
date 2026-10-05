import { z } from '@/lib/zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { LangCode } from '@/lib/languages'
import type { Grade, SrsState } from '@/lib/progress/types'
import { cardStateFromDbValue, cardStateToDbValue, review } from '@/lib/progress/srs'
import { appliesToSchedule, MODE_SKILL, type PracticeMode, type Skill } from '@/lib/practice/grading'
import { stripPhraseStop } from '@/lib/dictionary/textQuality'
import { countNewToday, studyDayEnd } from './activity'

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

const STATE_COLUMNS = [
  'stability', 'difficulty', 'elapsed_days', 'scheduled_days', 'learning_steps', 'reps', 'lapses', 'state',
  'due_at', 'last_review_at',
] as const

/** Where each skill's FSRS state lives on `user_words` (0160). */
export const SKILL_COLUMNS: Record<Skill, string> = { recall: 'fsrs_', recognition: 'fsrs_recog_' }

/** The card columns with the skill's state read under the recall names, through PostgREST
 *  aliases, so one row schema parses both skills. */
export function cardSelect(skill: Skill): string {
  const prefix = SKILL_COLUMNS[skill]
  const state = STATE_COLUMNS.map((c) => (skill === 'recall' ? `fsrs_${c}` : `fsrs_${c}:${prefix}${c}`))
  return 'id, lang, headword, reading, ipa, meaning_vi, meaning_en, example, example_translation, audio_url, entry_id, ' +
    state.join(', ')
}

const CARD_SELECT = cardSelect('recall')

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
  /** Most never-seen cards in one study day. */
  newLimit?: number
  /** Cards first graded today, spent from `newLimit`. Read from the answer log when absent. */
  newToday?: number
}

/** The session size. One constant, because `countDueCards` promises what
 *  `listDueCards` will hand over, and two copies of these numbers drift. */
export const SESSION_LIMITS = { limit: 50, newLimit: 20 } as const

/** The session queue: due cards already being learned, then a bounded number never seen.
 *  The two must stay split -- a new card is due the moment it is saved, so 404 of one
 *  account's 407 cards were due at once and one flat query buried the real reviews.
 *  Twenty new cards a study day is Anki's default allowance. A word marked "Đã biết" is
 *  suspended. */
export async function listDueCards(
  supabase: SupabaseClient, now: number, options: DueOptions = {},
): Promise<ReviewCard[]> {
  const { limit = SESSION_LIMITS.limit, newLimit = SESSION_LIMITS.newLimit } = options
  // Everything due before the study day ends, so a morning session also gets tonight's cards.
  const dueBy = new Date(studyDayEnd(now)).toISOString()

  const page = (fresh: boolean, take: number) =>
    supabase
      .from('user_words')
      .select(CARD_SELECT)
      .neq('status', 'known')
      .lte('fsrs_due_at', dueBy)
      .filter('fsrs_reps', fresh ? 'eq' : 'gt', 0)
      .order('fsrs_due_at', { ascending: true })
      .limit(take)

  const [{ data: reviews, error: reviewError }, newToday] = await Promise.all([
    page(false, limit), options.newToday ?? countNewToday(supabase, now),
  ])
  if (reviewError) throw reviewError
  const learned = z.array(cardRowSchema).parse(reviews ?? []).map(rowToCard)

  const room = Math.min(newLimit - newToday, limit - learned.length)
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
  const dueBy = new Date(studyDayEnd(now)).toISOString()

  const countBy = async (fresh: boolean): Promise<number> => {
    const { count, error } = await supabase
      .from('user_words')
      .select('*', { count: 'exact', head: true })
      .neq('status', 'known')
      .lte('fsrs_due_at', dueBy)
      .filter('fsrs_reps', fresh ? 'eq' : 'gt', 0)
    if (error) throw error
    return count ?? 0
  }

  // Both at once: in sequence this puts a second round trip to Seoul on the critical path
  // of /wordlist and /practice, neither of which can be cached at all.
  const [reviewDue, freshDue, newToday] = await Promise.all([
    countBy(false), countBy(true), options.newToday ?? countNewToday(supabase, now),
  ])
  const learned = Math.min(reviewDue, limit)
  const room = Math.min(newLimit - newToday, limit - learned)
  if (room <= 0) return learned
  return learned + Math.min(room, freshDue)
}

/** What a graded answer did: the schedule the word now has for the skill, whether the answer
 *  moved it, and whether its `review_events` row was saved. */
export interface GradeResult {
  next: SrsState
  applied: boolean
  logged: boolean
}

const RATING: Record<Grade, number> = { again: 1, hard: 2, good: 3, easy: 4 }

/** Grade a card on the mode's skill, persist the schedule when the answer applies, then log the
 *  answer. A lost log row does not undo a saved schedule, so it is reported, not thrown. */
export async function gradeCard(
  supabase: SupabaseClient, card: ReviewCard, mode: PracticeMode, grade: Grade, now: number,
): Promise<GradeResult> {
  const skill = MODE_SKILL[mode]
  const before = card.state
  const scheduled = review(before, grade, now)
  const applied = appliesToSchedule(before, grade, now)
  if (applied) {
    const p = SKILL_COLUMNS[skill]
    const { error } = await supabase.from('user_words').update({
      [`${p}stability`]: scheduled.stability,
      [`${p}difficulty`]: scheduled.difficulty,
      [`${p}elapsed_days`]: scheduled.elapsedDays,
      [`${p}scheduled_days`]: scheduled.scheduledDays,
      [`${p}learning_steps`]: scheduled.learningSteps,
      [`${p}reps`]: scheduled.reps,
      [`${p}lapses`]: scheduled.lapses,
      [`${p}state`]: cardStateToDbValue(scheduled.cardState),
      [`${p}due_at`]: new Date(scheduled.dueAt).toISOString(),
      [`${p}last_review_at`]: scheduled.lastReviewedAt ? new Date(scheduled.lastReviewedAt).toISOString() : null,
    }).eq('id', card.id)
    if (error) throw error
  }
  const { error: logError } = await supabase.from('review_events').insert({
    word_id: card.id,
    skill,
    mode,
    rating: RATING[grade],
    applied,
    state_before: cardStateToDbValue(before.cardState),
    state_after: cardStateToDbValue(scheduled.cardState),
    stability_before: before.stability,
    stability_after: scheduled.stability,
    difficulty_before: before.difficulty,
    difficulty_after: scheduled.difficulty,
    elapsed_days: scheduled.elapsedDays,
    scheduled_days: scheduled.scheduledDays,
    reviewed_at: new Date(now).toISOString(),
  })
  return { next: applied ? scheduled : before, applied, logged: !logError }
}

/** Grade a saved word by id, reading the mode's skill first. The practice modes work from
 *  `listWords`, which carries no scheduling state, so they cannot call `gradeCard`.
 *  Returns null when the row is gone -- deleted in another tab is not an error. */
export async function gradeWordById(
  supabase: SupabaseClient, id: string, mode: PracticeMode, grade: Grade, now: number = Date.now(),
): Promise<GradeResult | null> {
  const { data, error } = await supabase.from('user_words').select(cardSelect(MODE_SKILL[mode])).eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) return null
  return gradeCard(supabase, rowToCard(cardRowSchema.parse(data)), mode, grade, now)
}
