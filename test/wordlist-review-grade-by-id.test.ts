import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { gradeWordById } from '@/lib/wordlist/review'
import { authStub } from './helpers/supabase'

const cardRow = {
  id: 'w1', lang: 'en', headword: 'dog', reading: null, ipa: null,
  meaning_vi: 'con chó', meaning_en: 'dog', example: null, example_translation: null, audio_url: null,
  fsrs_stability: 3, fsrs_difficulty: 5, fsrs_elapsed_days: 1, fsrs_scheduled_days: 3,
  fsrs_learning_steps: 0, fsrs_reps: 2, fsrs_lapses: 0, fsrs_state: 2,
  fsrs_due_at: '2026-09-12T00:00:00Z', fsrs_last_review_at: '2026-09-09T00:00:00Z',
}

/** Chainable builder: select.eq.maybeSingle for the read, update.eq for the write. */
function mockClient({ row = cardRow as unknown }: { row?: unknown } = {}) {
  // Typed through the generic rather than a named parameter, so the recorded
  // calls can be read back without an unused argument.
  const update = vi.fn<(patch: Record<string, unknown>) => { eq: () => Promise<{ error: null }> }>(
    () => ({ eq: vi.fn(async () => ({ error: null })) }),
  )
  const maybeSingle = vi.fn(async () => ({ data: row, error: null }))
  const upsert = vi.fn(() => ({ error: null }))
  const insert = vi.fn(async () => ({ error: null }))
  const from = vi.fn(() => ({
    select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })),
    update,
    upsert,
    insert,
  }))
  const { auth } = authStub({ user: { id: 'u1' } })
  return { client: { from, auth } as unknown as SupabaseClient, update }
}

describe('gradeWordById', () => {
  const now = Date.parse('2026-09-12T00:00:00Z')

  it('writes the new schedule for the word that was practised', async () => {
    // Five of the six practice modes recorded nothing, so an evening of quiz and
    // typing left the review queue exactly as it was the day before.
    const { client, update } = mockClient()
    await gradeWordById(client, 'w1', 'review', 'good', now)
    expect(update).toHaveBeenCalledTimes(1)
    const [written] = update.mock.calls[0]
    expect(written.fsrs_reps).toBe(3)
    expect(Date.parse(written.fsrs_due_at as string)).toBeGreaterThan(now)
  })

  it('counts a wrong answer as a lapse', async () => {
    const { client, update } = mockClient()
    await gradeWordById(client, 'w1', 'review', 'again', now)
    expect(update.mock.calls[0][0].fsrs_lapses).toBe(1)
  })

  it('returns the state it wrote, so a caller can show it', async () => {
    const { client } = mockClient()
    const result = await gradeWordById(client, 'w1', 'review', 'good', now)
    expect(result?.next.vocabId).toBe('w1')
  })

  it('does nothing for a word deleted in another tab', async () => {
    // A practice session open while the word is removed from the wordlist should
    // finish the round, not throw at the learner.
    const { client, update } = mockClient({ row: null })
    await expect(gradeWordById(client, 'gone', 'review', 'good', now)).resolves.toBeNull()
    expect(update).not.toHaveBeenCalled()
  })

  it('rejects a row whose shape does not match instead of writing nonsense', async () => {
    const { client } = mockClient({ row: { id: 'w1', headword: 'dog' } })
    await expect(gradeWordById(client, 'w1', 'review', 'good', now)).rejects.toThrow()
  })
})
