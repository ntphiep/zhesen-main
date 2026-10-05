import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { countDueCards, listDueCards } from '@/lib/wordlist/review'

const card = (id: string, reps: number) => ({
  id, lang: 'en', headword: id, reading: null, ipa: null,
  meaning_vi: null, meaning_en: null, example: null, example_translation: null, audio_url: null,
  fsrs_stability: 1, fsrs_difficulty: 5, fsrs_elapsed_days: 0, fsrs_scheduled_days: 0,
  fsrs_learning_steps: 0, fsrs_reps: reps, fsrs_lapses: 0, fsrs_state: reps === 0 ? 0 : 2,
  fsrs_due_at: '2026-09-12T00:00:00Z', fsrs_last_review_at: null,
})

/** The answer log's count of new cards graded today: none. */
function noneToday() {
  const chain = {
    select: () => chain,
    eq: () => chain,
    gte: () => Promise.resolve({ count: 0, error: null }),
  }
  return chain
}

/**
 * Records the two queries the session makes. `filter('fsrs_reps', 'eq'|'gt', 0)`
 * is what separates cards never seen from cards already being learned.
 */
function mockClient({ learned = 0, fresh = 0 }: { learned?: number; fresh?: number }) {
  const asked: { kind: string; take: number }[] = []
  const from = vi.fn((table: string) => {
    if (table === 'review_events') return noneToday()
    let kind = ''
    const chain = {
      select: () => chain,
      neq: () => chain,
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

/** Head-only COUNTs: no rows come back, only the total per (fresh?) bucket. */
function mockCounter({ learned = 0, fresh = 0 }: { learned?: number; fresh?: number }) {
  const from = vi.fn((table: string) => {
    if (table === 'review_events') return noneToday()
    let kind = ''
    const chain = {
      select: () => chain,
      neq: () => chain,
      lte: () => chain,
      filter: (_col: string, op: string) => {
        kind = op
        return Promise.resolve({ count: kind === 'eq' ? fresh : learned, error: null })
      },
    }
    return chain
  })
  return { from } as unknown as SupabaseClient
}

describe('countDueCards', () => {
  // The number on the button is a promise about the next session. A flat COUNT
  // of overdue rows broke that promise badly: measured on this project's own
  // account, 406 rows were past due while the session served 22.
  it('promises exactly what the session will serve', async () => {
    await expect(countDueCards(mockCounter({ learned: 2, fresh: 404 }), NOW)).resolves.toBe(22)
  })

  it('counts every due review up to the session limit, leaving no room for new cards', async () => {
    await expect(countDueCards(mockCounter({ learned: 80, fresh: 404 }), NOW)).resolves.toBe(50)
  })

  it('is zero when nothing is due', async () => {
    await expect(countDueCards(mockCounter({}), NOW)).resolves.toBe(0)
  })

  it('agrees with the queue it describes', async () => {
    for (const pool of [{ learned: 2, fresh: 404 }, { learned: 0, fresh: 7 }, { learned: 12, fresh: 0 }]) {
      const queue = await listDueCards(mockClient(pool).client, NOW)
      await expect(countDueCards(mockCounter(pool), NOW)).resolves.toBe(queue.length)
    }
  })
})
