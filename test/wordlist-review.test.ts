import { describe, it, expect } from 'vitest'
import { rowToCard, gradeCard } from '@/lib/wordlist/review'

const row = {
  id: 'w1', lang: 'en' as const, headword: 'dog', reading: null, ipa: 'dɒɡ',
  meaning_vi: 'con chó', meaning_en: 'a dog', example: 'The dog ran.', example_translation: 'Con chó chạy.',
  audio_url: null,
  fsrs_stability: 10, fsrs_difficulty: 5, fsrs_elapsed_days: 3, fsrs_scheduled_days: 6, fsrs_learning_steps: 0,
  fsrs_reps: 2, fsrs_lapses: 0, fsrs_state: 2,
  fsrs_due_at: '2026-06-21T00:00:00.000Z', fsrs_last_review_at: null,
}

function updateSpy() {
  let payload: Record<string, unknown> | undefined
  const supabase = {
    from: () => ({
      update: (p: Record<string, unknown>) => { payload = p; return { eq: () => Promise.resolve({ error: null }) } },
      insert: () => Promise.resolve({ error: null }),
    }),
  } as unknown as import('@supabase/supabase-js').SupabaseClient
  return { supabase, get: () => payload }
}

describe('rowToCard', () => {
  it('maps a user_words row with fsrs columns to a review card + SrsState', () => {
    const c = rowToCard(row)
    expect(c).toMatchObject({ id: 'w1', lang: 'en', headword: 'dog', ipa: 'dɒɡ', meaningVi: 'con chó', example: 'The dog ran.' })
    expect(c.state).toMatchObject({
      vocabId: 'w1', stability: 10, difficulty: 5, elapsedDays: 3, scheduledDays: 6, learningSteps: 0, reps: 2, lapses: 0, cardState: 'review',
    })
    expect(c.state.dueAt).toBe(Date.parse('2026-06-21T00:00:00.000Z'))
    expect(c.state.lastReviewedAt).toBeNull()
  })
})

describe('gradeCard', () => {
  const now = Date.parse('2026-06-21T00:00:00.000Z')

  it('writes the next FSRS-6 schedule and pushes the due date forward on "good"', async () => {
    const { supabase, get } = updateSpy()
    const { next } = await gradeCard(supabase, rowToCard(row), 'review', 'good', now)
    expect(next.reps).toBe(3)
    expect(next.cardState).toBe('review')
    expect(get()!.fsrs_reps).toBe(3)
    expect(get()!.fsrs_state).toBe(2)
    expect(get()!.fsrs_scheduled_days).toBeGreaterThan(row.fsrs_scheduled_days)
    expect(Date.parse(get()!.fsrs_due_at as string)).toBeGreaterThan(now)
  })

  it('shortens the interval and counts a lapse on "again"', async () => {
    const { supabase, get } = updateSpy()
    const { next } = await gradeCard(supabase, rowToCard(row), 'review', 'again', now)
    expect(next.lapses).toBe(1)
    expect(get()!.fsrs_lapses).toBe(1)
    expect(get()!.fsrs_scheduled_days).toBeLessThan(row.fsrs_scheduled_days)
    expect(Date.parse(get()!.fsrs_due_at as string)).toBeGreaterThanOrEqual(now)
  })
})
