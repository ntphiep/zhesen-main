import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { listDueCards } from '@/lib/wordlist/review'

const card = (id: string, reps: number) => ({
  id, lang: 'en', headword: id, reading: null, ipa: null,
  meaning_vi: null, meaning_en: null, example: null, example_translation: null, audio_url: null,
  fsrs_stability: 1, fsrs_difficulty: 5, fsrs_elapsed_days: 0, fsrs_scheduled_days: 0,
  fsrs_learning_steps: 0, fsrs_reps: reps, fsrs_lapses: 0, fsrs_state: reps === 0 ? 0 : 2,
  fsrs_due_at: '2026-09-12T00:00:00Z', fsrs_last_review_at: null,
})

/**
 * Records the two queries the session makes. `filter('fsrs_reps', 'eq'|'gt', 0)`
 * is what separates cards never seen from cards already being learned.
 */
function mockClient({ learned = 0, fresh = 0 }: { learned?: number; fresh?: number }) {
  const asked: { kind: string; take: number }[] = []
  const from = vi.fn(() => {
    let kind = ''
    const chain = {
      select: () => chain,
      lte: () => chain,
      filter: (_col: string, op: string) => { kind = op; return chain },
      order: () => chain,
      limit: (take: number) => {
        asked.push({ kind, take })
        const pool = kind === 'eq'
          ? Array.from({ length: fresh }, (_, i) => card(`new${i}`, 0))
          : Array.from({ length: learned }, (_, i) => card(`old${i}`, 3))
        return Promise.resolve({ data: pool.slice(0, take), error: null })
      },
    }
    return chain
  })
  return { client: { from } as unknown as SupabaseClient, asked }
}

const NOW = Date.parse('2026-09-12T12:00:00Z')

describe('listDueCards', () => {
  it('caps how many never-seen cards enter one session', async () => {
    // A new card is due the moment it is saved, so importing a wordlist made every
    // word due at once: one account has 404 of 407 cards never reviewed and all 404
    // due. Fifty of them in a row is a wall, not a session.
    const { client } = mockClient({ fresh: 404 })
    const queue = await listDueCards(client, NOW)
    expect(queue).toHaveLength(20)
  })

  it('puts cards already being learned ahead of new ones', async () => {
    const { client } = mockClient({ learned: 3, fresh: 10 })
    const queue = await listDueCards(client, NOW)
    expect(queue.slice(0, 3).map((c) => c.id)).toEqual(['old0', 'old1', 'old2'])
    expect(queue.slice(3).every((c) => c.id.startsWith('new'))).toBe(true)
  })

  it('never exceeds the session size, however many are due', async () => {
    const { client } = mockClient({ learned: 100, fresh: 100 })
    expect(await listDueCards(client, NOW)).toHaveLength(50)
  })

  it('skips asking for new cards when reviews already fill the session', async () => {
    const { client, asked } = mockClient({ learned: 60, fresh: 100 })
    await listDueCards(client, NOW)
    expect(asked.map((a) => a.kind)).toEqual(['gt'])
  })

  it('honours the caps a caller sets', async () => {
    const { client } = mockClient({ fresh: 100 })
    expect(await listDueCards(client, NOW, { newLimit: 5 })).toHaveLength(5)
    expect(await listDueCards(client, NOW, { limit: 3, newLimit: 99 })).toHaveLength(3)
  })

  it('returns every due review even when nothing new is waiting', async () => {
    const { client } = mockClient({ learned: 7, fresh: 0 })
    expect(await listDueCards(client, NOW)).toHaveLength(7)
  })

  it('comes back empty when nothing is due', async () => {
    const { client } = mockClient({})
    expect(await listDueCards(client, NOW)).toEqual([])
  })
})
