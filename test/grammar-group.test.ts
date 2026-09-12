import { describe, it, expect } from 'vitest'
import { groupByLevelAndCategory } from '@/lib/grammar/group'
import type { GrammarPoint } from '@/lib/grammar/types'

function point(over: Partial<GrammarPoint>): GrammarPoint {
  return {
    id: 'x', lang: 'zh', levelScheme: 'HSK', level: 'HSK1', categoryVi: 'cat', titleVi: 't', pattern: 'p', sortOrder: 0,
    ...over,
  }
}

describe('groupByLevelAndCategory', () => {
  it('groups by level then category_vi, preserving input order', () => {
    const points = [
      point({ id: 'a', level: 'HSK1', categoryVi: 'Câu hỏi' }),
      point({ id: 'b', level: 'HSK1', categoryVi: 'Câu hỏi' }),
      point({ id: 'c', level: 'HSK1', categoryVi: 'Phủ định' }),
      point({ id: 'd', level: 'HSK2', categoryVi: 'Câu hỏi' }),
    ]
    const groups = groupByLevelAndCategory(points)
    expect(groups.map((g) => g.level)).toEqual(['HSK1', 'HSK2'])
    expect(groups[0].categories.map((c) => c.categoryVi)).toEqual(['Câu hỏi', 'Phủ định'])
    expect(groups[0].categories[0].points.map((p) => p.id)).toEqual(['a', 'b'])
    expect(groups[1].categories[0].points.map((p) => p.id)).toEqual(['d'])
  })

  it('falls back to a "Khác" bucket for a missing level or category', () => {
    const groups = groupByLevelAndCategory([point({ id: 'a', level: null, categoryVi: null })])
    expect(groups).toEqual([{ level: 'Khác', categories: [{ categoryVi: 'Khác', points: [expect.objectContaining({ id: 'a' })] }] }])
  })

  it('returns [] for an empty input', () => {
    expect(groupByLevelAndCategory([])).toEqual([])
  })
})
