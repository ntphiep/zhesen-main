import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { countDueCards, listDueCards } from '@/lib/wordlist/review'
import { getTodayEvents } from '@/lib/wordlist/activity'
import { listUpcoming } from '@/lib/wordlist/forecast'
import { computeWordlistStats, type StatRow } from '@/lib/wordlist/stats'
import { LEECH_LAPSES } from '@/lib/wordlist/types'
import { clientReturning, queryBuilder } from './helpers/supabase'

const NOW = Date.parse('2026-10-05T03:00:00Z') // 10:00 in Hà Nội
const DAY = 86_400_000

const card = (id: string, reps: number) => ({
  id, lang: 'en', headword: id, reading: null, ipa: null,
  meaning_vi: null, meaning_en: null, example: null, example_translation: null, audio_url: null,
  fsrs_stability: 1, fsrs_difficulty: 5, fsrs_elapsed_days: 0, fsrs_scheduled_days: 0,
  fsrs_learning_steps: 0, fsrs_reps: reps, fsrs_lapses: 0, fsrs_state: reps === 0 ? 0 : 2,
  fsrs_due_at: '2026-10-05T00:00:00Z', fsrs_last_review_at: null,
})

/** user_words answers `learned` reviews and `fresh` new cards; review_events counts `newToday`. */
function client({ learned = 0, fresh = 0, newToday = 0 }) {
  const asked: string[] = []
  const words = () => {
    let kind = ''
    const b = queryBuilder({ data: [], error: null }, {
      filter: vi.fn((_c: string, op: string) => { kind = op; return b }),
      limit: vi.fn(async (take: number) => {
        asked.push(kind)
        const pool = kind === 'eq'
          ? Array.from({ length: fresh }, (_, i) => card(`new${i}`, 0))
          : Array.from({ length: learned }, (_, i) => card(`old${i}`, 3))
        return { data: pool.slice(0, take), error: null }
      }),
      then: (ok: (v: unknown) => unknown) => Promise.resolve({ count: kind === 'eq' ? fresh : learned, error: null }).then(ok),
    })
    return b
  }
  const events = queryBuilder({ data: null, error: null }, {
    then: (ok: (v: unknown) => unknown) => Promise.resolve({ count: newToday, data: null, error: null }).then(ok),
  })
  const from = vi.fn((table: string) => (table === 'review_events' ? events : words()))
  return { client: { from } as unknown as SupabaseClient, asked, events }
}

describe('the daily new-card allowance', () => {
  it('serves no new card once twenty were first answered today', async () => {
    const { client: c, asked } = client({ learned: 2, fresh: 50, newToday: 20 })
    const queue = await listDueCards(c, NOW)
    expect(queue.map((x) => x.id)).toEqual(['old0', 'old1'])
    expect(asked).toEqual(['gt'])
    await expect(countDueCards(c, NOW)).resolves.toBe(2)
  })

  it('serves what is left of the twenty', async () => {
    const { client: c, events } = client({ fresh: 50, newToday: 15 })
    expect(await listDueCards(c, NOW)).toHaveLength(5)
    await expect(countDueCards(c, NOW)).resolves.toBe(5)
    expect(events.eq).toHaveBeenCalledWith('skill', 'recall')
    expect(events.eq).toHaveBeenCalledWith('state_before', 0)
    expect(events.gte).toHaveBeenCalledWith('reviewed_at', '2026-10-04T21:00:00.000Z')
  })

  it('takes the count from the caller when it already has it', async () => {
    const { client: c, events } = client({ fresh: 50, newToday: 0 })
    expect(await listDueCards(c, NOW, { newToday: 18 })).toHaveLength(2)
    expect(events.gte).not.toHaveBeenCalled()
  })
})

describe('a word marked "Đã biết"', () => {
  it('leaves the queue, the count and the forecast', async () => {
    for (const run of [
      (c: SupabaseClient) => listDueCards(c, NOW, { newToday: 0 }),
      (c: SupabaseClient) => countDueCards(c, NOW, { newToday: 0 }),
      (c: SupabaseClient) => listUpcoming(c, NOW, 7),
    ]) {
      const { client: c, builder } = clientReturning([])
      await run(c)
      expect(builder.neq).toHaveBeenCalledWith('status', 'known')
    }
  })

  it('leaves the due count of the stats', () => {
    const row = (status: StatRow['status']): StatRow => ({
      lang: 'en', status, srsIntervalDays: 3, srsDueAt: new Date(NOW - DAY).toISOString(), srsLastReviewedAt: null, srsReps: 2,
    })
    expect(computeWordlistStats([row('known'), row('new'), row('learning')], [], NOW).due).toBe(2)
  })
})

describe('today from the answer log', () => {
  it('counts words answered in any mode, and new words graded for recall', async () => {
    const { client: c } = clientReturning([
      { word_id: 'a', skill: 'recall', state_before: 0, applied: true },
      { word_id: 'a', skill: 'recall', state_before: 1, applied: true },
      { word_id: 'b', skill: 'recognition', state_before: 0, applied: true },
      { word_id: 'c', skill: 'recall', state_before: 2, applied: false },
    ])
    await expect(getTodayEvents(c, NOW)).resolves.toEqual({ newToday: 1, reviewedToday: 3 })
  })

  it('feeds the stats when given', () => {
    const past = new Date(NOW - DAY).toISOString()
    const rows: StatRow[] = Array.from({ length: 30 }, () => ({
      lang: 'en', status: 'new', srsIntervalDays: 0, srsDueAt: past, srsLastReviewedAt: null, srsReps: 0,
    }))
    const s = computeWordlistStats(rows, [], NOW, { newToday: 12, reviewedToday: 7 })
    expect(s.due).toBe(8)
    expect(s.reviewedToday).toBe(7)
  })
})

describe('leeches', () => {
  it('uses Anki\'s threshold of eight lapses', () => {
    expect(LEECH_LAPSES).toBe(8)
  })
})
