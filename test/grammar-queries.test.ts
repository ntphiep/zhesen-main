import { describe, it, expect } from 'vitest'
import { listGrammarPointsByLang, countGrammarPointsByLang, getGrammarPointDetail, getGrammarPointsForEntry } from '@/lib/grammar/queries'
import { clientReturning } from './helpers/supabase'

const mockClient = (returnData: unknown) => clientReturning(returnData).client

const pointRow = {
  id: 'zh:hsk1:cau-vi-ngu-dong-tu', lang: 'zh', level_scheme: 'HSK', level: 'HSK1', category_vi: 'Câu cơ bản',
  title_vi: 'Câu khẳng định cơ bản', pattern: 'S + V + O', explanation_vi: 'giải thích',
  common_mistake_vi: null, sort_order: 0,
}

describe('listGrammarPointsByLang', () => {
  it('maps rows to GrammarPoint[]', async () => {
    const client = mockClient([pointRow])
    const res = await listGrammarPointsByLang(client, 'zh')
    expect(res).toEqual([{
      id: pointRow.id, lang: 'zh', levelScheme: 'HSK', level: 'HSK1', categoryVi: 'Câu cơ bản',
      titleVi: 'Câu khẳng định cơ bản', pattern: 'S + V + O', sortOrder: 0,
    }])
  })
})

describe('countGrammarPointsByLang', () => {
  it('tallies rows per language', async () => {
    const client = mockClient([{ lang: 'en' }, { lang: 'en' }, { lang: 'zh' }])
    expect(await countGrammarPointsByLang(client)).toEqual({ en: 2, es: 0, zh: 1 })
  })
})

describe('getGrammarPointDetail', () => {
  it('returns null when not found', async () => {
    const client = mockClient(null)
    expect(await getGrammarPointDetail(client, 'zh:missing')).toBeNull()
  })

  it('maps a found row, sorting its examples', async () => {
    const client = mockClient({
      ...pointRow,
      grammar_examples: [
        { text: 'b', reading: null, translation_vi: 'B', sort_order: 1 },
        { text: 'a', reading: null, translation_vi: 'A', sort_order: 0 },
      ],
    })
    const detail = await getGrammarPointDetail(client, pointRow.id)
    expect(detail?.examples.map((e) => e.text)).toEqual(['a', 'b'])
  })
})

describe('getGrammarPointsForEntry', () => {
  it('unwraps the grammar_points embed and sorts by level then sort_order', async () => {
    const client = mockClient([
      { grammar_points: { ...pointRow, id: 'zh:hsk2:x', level: 'HSK2', sort_order: 0 } },
      { grammar_points: { ...pointRow, id: 'zh:hsk1:y', level: 'HSK1', sort_order: 1 } },
      { grammar_points: { ...pointRow, id: 'zh:hsk1:z', level: 'HSK1', sort_order: 0 } },
    ])
    const res = await getGrammarPointsForEntry(client, 'zh:把')
    expect(res.map((p) => p.id)).toEqual(['zh:hsk1:z', 'zh:hsk1:y', 'zh:hsk2:x'])
  })
})
