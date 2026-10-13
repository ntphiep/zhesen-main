import { describe, it, expect, vi } from 'vitest'
import { parseSubset, subsetHref } from '@/lib/practice/subset'
import { listPracticeWords } from '@/lib/wordlist/store'
import { buildQuiz, type QuizWord } from '@/lib/practice/quiz'
import { clientReturning } from './helpers/supabase'

const A = '0b6f1c1e-0000-4000-8000-000000000001'
const B = '0b6f1c1e-0000-4000-8000-000000000002'

describe('practice subset in the URL', () => {
  it('reads back what it writes, one parameter per id', () => {
    const words = subsetHref('/practice/write', { kind: 'words', ids: [A, B] })
    expect(words).toBe(`/practice/write?word=${A}&word=${B}`)
    expect(parseSubset({ word: [A, B] })).toEqual({ kind: 'words', ids: [A, B] })

    // An entry key may hold a comma, so each id is its own parameter.
    const href = subsetHref('/practice/quiz', { kind: 'entries', ids: ['en:a, b', 'en:c'] })
    const sp = new URLSearchParams(href.split('?')[1])
    expect(parseSubset({ entry: sp.getAll('entry') })).toEqual({ kind: 'entries', ids: ['en:a, b', 'en:c'] })

    expect(parseSubset({ lang: 'en', level: 'A1' })).toEqual({ kind: 'level', lang: 'en', level: 'A1' })
    expect(parseSubset({ lang: 'zh', level: 'HSK7-9' })).toEqual({ kind: 'level', lang: 'zh', level: 'HSK7-9' })
    expect(parseSubset({ due: 'recognition' })).toEqual({ kind: 'due' })
  })

  it('practises the whole notebook when the URL names nothing it can use', () => {
    expect(parseSubset({})).toBeNull()
    expect(parseSubset({ word: 'not-a-uuid' })).toBeNull()
    expect(parseSubset({ lang: 'fr', level: 'A1' })).toBeNull()
    expect(parseSubset({ lang: 'en', level: 'HSK1' })).toBeNull()
    expect(parseSubset({ due: 'recall' })).toBeNull()
  })
})

describe('listPracticeWords with a subset', () => {
  it('applies the same filter to the count and to the rows', async () => {
    const filter = vi.fn()
    const { client, builder } = clientReturning([], null)
    filter.mockImplementation(() => builder)
    builder.filter = filter
    builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], count: 1, error: null }).then(resolve)
    await listPracticeWords(client, { only: { kind: 'entries', ids: ['en:a, b', 'en:c'] } })
    expect(filter.mock.calls).toEqual([
      ['entry_id', 'in', '("en:a, b",en:c)'],
      ['entry_id', 'in', '("en:a, b",en:c)'],
    ])
  })

  it('narrows to recognition due by the end of the study day, known words left out', async () => {
    const { client, builder } = clientReturning([], null)
    builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], count: 0, error: null }).then(resolve)
    await listPracticeWords(client, { only: { kind: 'due' } })
    const calls = (builder.filter as ReturnType<typeof vi.fn>).mock.calls
    expect(calls[0]).toEqual(['status', 'neq', 'known'])
    expect(calls[1][0]).toBe('fsrs_recog_due_at')
    expect(calls[1][1]).toBe('lte')
  })
})

describe('buildQuiz with a subset', () => {
  const word = (id: string, meaningVi: string): QuizWord => ({ id, headword: id, ipa: null, lang: 'en', meaningVi, audioUrl: null, entryId: null, pos: null })
  const words = [word('cat', 'con mèo'), word('dog', 'con chó'), word('sun', 'mặt trời'), word('rain', 'mưa'), word('tree', 'cây')]

  it('asks only the subset and draws wrong answers from every word', () => {
    const qs = buildQuiz(words, 10, () => 0.3, new Map(), new Set(['cat']))
    expect(qs.map((q) => q.id)).toEqual(['cat'])
    expect(qs[0].options).toHaveLength(4)
    expect(qs[0].options).toContain('con mèo')
  })

  it('asks nothing when no word of the subset is usable', () => {
    expect(buildQuiz(words, 10, () => 0.3, new Map(), new Set(['moon']))).toEqual([])
  })
})
