import { describe, it, expect } from 'vitest'
import { InMemoryKV } from '@/lib/progress/kv'
import { LocalProgressStore } from '@/lib/progress/LocalProgressStore'
import { DAY_MS } from '@/lib/progress/srs'

const T0 = 1_000_000_000_000

function store() {
  return new LocalProgressStore(new InMemoryKV())
}

describe('LocalProgressStore', () => {
  it('ensureCards creates due cards, idempotently', async () => {
    const s = store()
    await s.ensureCards([{ vocabId: 'zh-1', lang: 'zh' }], T0)
    await s.ensureCards([{ vocabId: 'zh-1', lang: 'zh' }], T0 + 5) // must not reset
    const due = await s.getDueCards('zh', T0)
    expect(due).toHaveLength(1)
    expect(due[0].vocabId).toBe('zh-1')
  })

  it('countDue filters by language and due time', async () => {
    const s = store()
    await s.ensureCards(
      [{ vocabId: 'zh-1', lang: 'zh' }, { vocabId: 'es-1', lang: 'es' }],
      T0,
    )
    expect(await s.countDue('zh', T0)).toBe(1)
    expect(await s.countDue('es', T0)).toBe(1)
    expect(await s.countDue('en', T0)).toBe(0)
  })

  it('recordReview good pushes the card out of the due window', async () => {
    const s = store()
    await s.ensureCards([{ vocabId: 'zh-1', lang: 'zh' }], T0)
    const card = await s.recordReview('zh-1', 'good', T0)
    expect(card.intervalDays).toBe(1)
    expect(await s.countDue('zh', T0)).toBe(0)
    expect(await s.countDue('zh', T0 + DAY_MS)).toBe(1)
  })

  it('persists across instances sharing a backend', async () => {
    const kv = new InMemoryKV()
    const a = new LocalProgressStore(kv)
    await a.ensureCards([{ vocabId: 'zh-1', lang: 'zh' }], T0)
    await a.recordReview('zh-1', 'good', T0)
    const b = new LocalProgressStore(kv)
    expect(await b.countDue('zh', T0)).toBe(0)
  })

  it('tracks lesson progress', async () => {
    const s = store()
    expect(await s.getLessonProgress('zh-l1')).toBeNull()
    await s.setLessonProgress('zh-l1', 'completed', T0)
    const p = await s.getLessonProgress('zh-l1')
    expect(p?.status).toBe('completed')
    expect(p?.completedAt).toBe(T0)
  })
})
