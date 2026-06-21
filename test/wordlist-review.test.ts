import { describe, it, expect } from 'vitest'
import { rowToCard, gradeCard } from '@/lib/wordlist/review'

const row = {
  id: 'w1', lang: 'en' as const, headword: 'dog', reading: null, ipa: 'dɒɡ',
  meaning_vi: 'con chó', meaning_en: 'a dog', example: 'The dog ran.', example_translation: 'Con chó chạy.',
  audio_url: null,
  srs_interval_days: 6, srs_ease: 2.5, srs_reps: 2, srs_lapses: 0,
  srs_due_at: '2026-06-21T00:00:00.000Z', srs_last_reviewed_at: null,
}

function updateSpy() {
  let payload: Record<string, unknown> | undefined
  const supabase = {
    from: () => ({ update: (p: Record<string, unknown>) => { payload = p; return { eq: () => Promise.resolve({ error: null }) } } }),
  } as unknown as import('@supabase/supabase-js').SupabaseClient
  return { supabase, get: () => payload }
}

describe('rowToCard', () => {
  it('maps a user_words row with srs columns to a review card + SrsState', () => {
    const c = rowToCard(row)
    expect(c).toMatchObject({ id: 'w1', lang: 'en', headword: 'dog', ipa: 'dɒɡ', meaningVi: 'con chó', example: 'The dog ran.' })
    expect(c.state).toMatchObject({ vocabId: 'w1', intervalDays: 6, ease: 2.5, reps: 2, lapses: 0 })
    expect(c.state.dueAt).toBe(Date.parse('2026-06-21T00:00:00.000Z'))
    expect(c.state.lastReviewedAt).toBeNull()
  })
})

describe('gradeCard', () => {
  const now = Date.parse('2026-06-21T00:00:00.000Z')

  it('writes the next SM-2 schedule and pushes the due date forward on "good"', async () => {
    const { supabase, get } = updateSpy()
    const next = await gradeCard(supabase, rowToCard(row), 'good', now)
    expect(next.reps).toBe(3)
    expect(next.intervalDays).toBe(15) // round(6 * 2.5)
    expect(get()!.srs_reps).toBe(3)
    expect(get()!.srs_interval_days).toBe(15)
    expect(Date.parse(get()!.srs_due_at as string)).toBeGreaterThan(now)
  })

  it('keeps the card due immediately and counts a lapse on "again"', async () => {
    const { supabase, get } = updateSpy()
    await gradeCard(supabase, rowToCard(row), 'again', now)
    expect(get()!.srs_reps).toBe(0)
    expect(get()!.srs_lapses).toBe(1)
    expect(Date.parse(get()!.srs_due_at as string)).toBe(now)
  })
})
