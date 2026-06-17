import { describe, it, expect, vi } from 'vitest'
import { SupabaseProgressStore } from '@/lib/progress/SupabaseProgressStore'
import { initialSrsState, DAY_MS } from '@/lib/progress/srs'

const T0 = 1_000_000_000_000

// Minimal fake: holds one srs_state row, supports the calls the store makes.
function fakeClient(initialRow: any) {
  let row = initialRow
  return {
    _row: () => row,
    from() {
      return {
        select() { return this },
        eq() { return this },
        maybeSingle: async () => ({ data: row, error: null }),
        upsert: async (vals: any) => { row = Array.isArray(vals) ? vals[0] : vals; return { error: null } },
      }
    },
  } as any
}

describe('SupabaseProgressStore.recordReview', () => {
  it('reads the card, applies review(), and upserts the new state', async () => {
    const existing = { user_id: 'u1', vocab_id: 'zh-1', lang: 'zh', interval_days: 0, ease: 2.5, reps: 0, lapses: 0, due_at: new Date(T0).toISOString(), last_reviewed_at: null }
    const client = fakeClient(existing)
    const store = new SupabaseProgressStore(client as unknown as any, 'u1')
    const card = await store.recordReview('zh-1', 'good', T0)
    expect(card.reps).toBe(1)
    expect(card.intervalDays).toBe(1)
    expect(card.dueAt).toBe(T0 + DAY_MS)
    expect(client._row().interval_days).toBe(1) // persisted
  })
})
