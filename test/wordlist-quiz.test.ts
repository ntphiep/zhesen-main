import { describe, it, expect } from 'vitest'
import { buildQuiz, type QuizWord } from '@/lib/practice/quiz'

const w = (id: string, headword: string, meaningVi: string | null): QuizWord =>
  ({ id, headword, ipa: null, lang: 'en', meaningVi })

const six = [
  w('1', 'dog', 'con chó'), w('2', 'cat', 'con mèo'), w('3', 'water', 'nước'),
  w('4', 'fire', 'lửa'), w('5', 'tree', 'cái cây'), w('6', 'book', 'quyển sách'),
]

describe('buildQuiz', () => {
  it('builds the requested number of questions, each with the answer among 4 options', () => {
    const qs = buildQuiz(six, 4, () => 0)
    expect(qs).toHaveLength(4)
    for (const q of qs) {
      expect(q.options).toContain(q.answer)
      expect(q.options).toHaveLength(4)
      expect(new Set(q.options).size).toBe(4) // distinct options
      const target = six.find((x) => x.id === q.id)!
      expect(q.answer).toBe(target.meaningVi)
    }
  })

  it('excludes words without a Vietnamese meaning', () => {
    const qs = buildQuiz([...six, w('7', 'zzz', null), w('8', 'yyy', '   ')], 20, () => 0)
    expect(qs.every((q) => !['7', '8'].includes(q.id))).toBe(true)
  })

  it('caps at the number of usable words', () => {
    expect(buildQuiz(six, 99, () => 0)).toHaveLength(6)
  })

  it('still produces a valid question when there are fewer than 4 words', () => {
    const qs = buildQuiz([w('1', 'dog', 'con chó'), w('2', 'cat', 'con mèo')], 5, () => 0)
    expect(qs).toHaveLength(2)
    for (const q of qs) {
      expect(q.options).toContain(q.answer)
      expect(q.options.length).toBeLessThanOrEqual(4)
      expect(q.options.length).toBeGreaterThanOrEqual(1)
    }
  })
})
