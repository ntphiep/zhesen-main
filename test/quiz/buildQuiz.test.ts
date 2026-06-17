import { describe, it, expect } from 'vitest'
import { buildQuiz } from '@/lib/quiz/buildQuiz'
import type { VocabItem } from '@/lib/content/types'

const v = (id: string, term: string, vi: string): VocabItem => ({
  id, lang: 'es', term, translation: { vi },
})
const pool = [v('1', 'hola', 'xin chào'), v('2', 'gracias', 'cảm ơn'), v('3', 'adiós', 'tạm biệt'), v('4', 'perdón', 'xin lỗi')]

// deterministic rng: always 0 -> stable ordering
const rng = () => 0

describe('buildQuiz', () => {
  it('builds one question per item', () => {
    const qs = buildQuiz(pool, pool, rng)
    expect(qs).toHaveLength(4)
  })
  it('each question has 4 options including the correct translation at answerIndex', () => {
    const qs = buildQuiz([pool[0]], pool, rng)
    const q = qs[0]
    expect(q.vocabId).toBe('1')
    expect(q.prompt).toBe('hola')
    expect(q.options).toHaveLength(4)
    expect(q.options[q.answerIndex]).toBe('xin chào')
  })
  it('falls back to fewer options when pool is tiny', () => {
    const tiny = [pool[0], pool[1]]
    const q = buildQuiz([tiny[0]], tiny, rng)[0]
    expect(q.options).toContain('xin chào')
    expect(q.options.length).toBeGreaterThanOrEqual(2)
    expect(q.options.length).toBeLessThanOrEqual(4)
  })
})
