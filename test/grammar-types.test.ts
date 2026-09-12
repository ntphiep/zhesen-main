import { describe, it, expect } from 'vitest'
import { toGrammarPoint, toGrammarPointDetail } from '@/lib/grammar/types'

const baseRow = {
  id: 'zh:hsk3:cau-chu-ba-co-ban', lang: 'zh' as const, level_scheme: 'HSK' as const, level: 'HSK3',
  category_vi: 'Câu chữ 把', title_vi: 'Câu chữ 把 cơ bản', pattern: 'S + 把 + O + V',
  explanation_vi: 'giải thích', common_mistake_vi: 'lỗi hay gặp', sort_order: 3,
}

describe('toGrammarPoint', () => {
  it('maps snake_case row to camelCase GrammarPoint', () => {
    expect(toGrammarPoint(baseRow)).toEqual({
      id: baseRow.id, lang: 'zh', levelScheme: 'HSK', level: 'HSK3', categoryVi: 'Câu chữ 把',
      titleVi: 'Câu chữ 把 cơ bản', pattern: 'S + 把 + O + V', sortOrder: 3,
    })
  })
})

describe('toGrammarPointDetail', () => {
  it('sorts examples by sort_order and maps their fields', () => {
    const detail = toGrammarPointDetail({
      ...baseRow,
      grammar_examples: [
        { text: '第二个例子', reading: 'dì èr gè lìzi', translation_vi: 'ví dụ hai', sort_order: 1 },
        { text: '第一个例子', reading: 'dì yī gè lìzi', translation_vi: 'ví dụ một', sort_order: 0 },
      ],
    })
    expect(detail.examples.map((e) => e.text)).toEqual(['第一个例子', '第二个例子'])
    expect(detail.commonMistakeVi).toBe('lỗi hay gặp')
    expect(detail.explanationVi).toBe('giải thích')
  })

  it('defaults to an empty example list when grammar_examples is null', () => {
    const detail = toGrammarPointDetail({ ...baseRow, grammar_examples: null })
    expect(detail.examples).toEqual([])
  })
})
