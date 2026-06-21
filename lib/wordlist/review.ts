import type { SupabaseClient } from '@supabase/supabase-js'
import type { LangCode } from '@/lib/content/types'
import type { Grade, SrsState } from '@/lib/progress/types'
import { review } from '@/lib/progress/srs'
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

interface CardRow {
  id: string; lang: LangCode; headword: string; reading: string | null; ipa: string | null
  meaning_vi: string | null; meaning_en: string | null; example: string | null
  example_translation: string | null; audio_url: string | null
  srs_interval_days: number; srs_ease: number; srs_reps: number; srs_lapses: number
  srs_due_at: string; srs_last_reviewed_at: string | null
}

const CARD_SELECT =
  'id, lang, headword, reading, ipa, meaning_vi, meaning_en, example, example_translation, audio_url, ' +
  'srs_interval_days, srs_ease, srs_reps, srs_lapses, srs_due_at, srs_last_reviewed_at'

export function rowToCard(r: CardRow): ReviewCard {
  return {
    id: r.id, lang: r.lang, headword: r.headword, reading: r.reading, ipa: r.ipa,
    meaningVi: r.meaning_vi, meaningEn: r.meaning_en, example: r.example,
    exampleTranslation: r.example_translation, audioUrl: r.audio_url,
    state: {
      vocabId: r.id,
      intervalDays: r.srs_interval_days,
      ease: r.srs_ease,
      reps: r.srs_reps,
      lapses: r.srs_lapses,
      dueAt: Date.parse(r.srs_due_at),
      lastReviewedAt: r.srs_last_reviewed_at ? Date.parse(r.srs_last_reviewed_at) : null,
    },
  }
}

/** Cards whose next review is due at or before `now`, soonest first. RLS scopes to the user. */
export async function listDueCards(supabase: SupabaseClient, now: number, limit = 50): Promise<ReviewCard[]> {
  const { data, error } = await supabase
    .from('user_words')
    .select(CARD_SELECT)
    .lte('srs_due_at', new Date(now).toISOString())
    .order('srs_due_at', { ascending: true })
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as unknown as CardRow[]).map(rowToCard)
}

/** Number of wordlist cards currently due. RLS scopes to the user. */
export async function countDueCards(supabase: SupabaseClient, now: number): Promise<number> {
  const { count, error } = await supabase
    .from('user_words')
    .select('*', { count: 'exact', head: true })
    .lte('srs_due_at', new Date(now).toISOString())
  if (error) throw error
  return count ?? 0
}

/** Grade a card with the shared SM-2 algorithm and persist the new schedule. */
export async function gradeCard(supabase: SupabaseClient, card: ReviewCard, grade: Grade, now: number): Promise<SrsState> {
  const next = review(card.state, grade, now)
  const { error } = await supabase.from('user_words').update({
    srs_interval_days: next.intervalDays,
    srs_ease: next.ease,
    srs_reps: next.reps,
    srs_lapses: next.lapses,
    srs_due_at: new Date(next.dueAt).toISOString(),
    srs_last_reviewed_at: next.lastReviewedAt ? new Date(next.lastReviewedAt).toISOString() : null,
  }).eq('id', card.id)
  if (error) throw error
  // Record today's activity for the streak; never fail the grade over it.
  try { await logActivityDay(supabase, now) } catch { /* ignore */ }
  return next
}
