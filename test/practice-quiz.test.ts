import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildQuiz, type QuizWord } from '@/lib/practice/quiz'
import { listLearnerDistractors, listLearnerGists } from '@/lib/dictionary/learner'
import { queryBuilder } from './helpers/supabase'

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

  // Measured on production: water (Nước), agua (Nước.) and 水 (Nước) offered "Nước."
  // beside "Nước", and picking "Nước." was graded wrong.
  it('never offers two options that differ only by trailing punctuation or case', () => {
    const words = [
      w('1', 'water', 'Nước'), w('2', 'agua', 'Nước.'), w('3', '水', 'nước'),
      w('4', 'dog', 'con chó'),
    ]
    const key = (m: string) => m.trim().replace(/[\s\p{P}]+$/u, '').toLocaleLowerCase('vi')
    for (const q of buildQuiz(words, 4, () => 0)) {
      expect(new Set(q.options.map(key)).size).toBe(q.options.length)
    }
  })

  it('gives no quiz when every meaning collapses to one after that normalisation', () => {
    const words = [w('1', 'water', 'Nước'), w('2', 'agua', 'Nước.'), w('3', '水', 'nước ')]
    expect(buildQuiz(words, 3, () => 0)).toEqual([])
  })
})

const word = (id: string, meaningVi: string, lang: QuizWord['lang'], pos: string | null): QuizWord =>
  ({ id, headword: id, ipa: null, lang, meaningVi, pos, entryId: `${lang}:${id}` })

// Distractors that share the answer's language and part of speech, or that a learner
// confuses with it, test the meaning rather than the word class.
describe('buildQuiz distractor order', () => {
  const pool = [
    word('dog', 'con chó', 'en', 'noun'), word('cat', 'con mèo', 'en', 'noun'),
    word('run', 'chạy', 'en', 'verb'), word('eat', 'ăn', 'en', 'verb'),
    word('perro', 'con chó sói', 'es', 'noun'),
  ]
  const only = (id: string) => (q: { id: string }) => q.id === id

  // #112: a synonym's gloss can be another meaning of the word itself, a second right answer.
  it('offers the same part of speech first, then confusables, and no synonyms', () => {
    const learner = new Map([['en:dog', { confusable: ['con sói'] }]])
    const q = buildQuiz(pool, 5, () => 0, learner).find(only('dog'))!
    expect(q.options.filter((o) => o !== q.answer).sort()).toEqual(['con mèo', 'con sói', 'chạy'].sort())
  })

  it('never offers any distractor that shares a Vietnamese term with the answer', () => {
    const kids = [word('child', 'Trẻ em, đứa trẻ', 'en', 'noun'), word('take', 'cầm, lấy', 'en', 'verb')]
    const learner = new Map([['en:child', { confusable: ['trẻ em'] }]])
    const q = buildQuiz(kids, 2, () => 0, learner).find(only('child'))!
    expect(q.options).toEqual(expect.arrayContaining(['Trẻ em, đứa trẻ', 'cầm, lấy']))
    expect(q.options).not.toContain('trẻ em')
  })

  it('reads a shorter term inside an answer term as the same answer, by whole syllables', () => {
    const glad = [word('happy', 'Vui vẻ, hạnh phúc', 'en', 'adjective'), word('take', 'cầm, lấy', 'en', 'verb')]
    const learner = new Map([['en:happy', { confusable: ['vui', 'may mắn', 'vui lòng'] }]])
    const q = buildQuiz(glad, 2, () => 0, learner).find(only('happy'))!
    expect(q.options).not.toContain('vui')
    expect(q.options).toEqual(expect.arrayContaining(['may mắn', 'vui lòng']))
  })

  it('falls back to the same language before other languages', () => {
    const q = buildQuiz(pool, 5, () => 0).find(only('dog'))!
    const distractors = q.options.filter((o) => o !== q.answer)
    expect(distractors).toHaveLength(3)
    expect(distractors).not.toContain('con chó sói')
  })
})

// Confusable links carry no Vietnamese text, so the gist comes from the target.
describe('listLearnerDistractors', () => {
  it('reads each confusable target\'s first published gist, and asks for no synonym', async () => {
    const links = queryBuilder({ data: [
      { entry_id: 'en:dog', kind: 'confusable', target_entry_id: 'en:wolf' },
      { entry_id: 'en:dog', kind: 'confusable', target_entry_id: 'en:hidden' },
    ], error: null })
    const gists = queryBuilder({ data: [
      { entry_id: 'en:wolf', gist_vi: ['con sói', 'chó sói'] },
    ], error: null })
    const from = vi.fn((table: string) => (table === 'learner_links' ? links : gists))
    const client = { schema: vi.fn(() => ({ from })) } as unknown as SupabaseClient
    const out = await listLearnerDistractors(client, ['en:dog'])
    expect(out.get('en:dog')).toEqual({ confusable: ['con sói'] })
    expect(links.eq).toHaveBeenCalledWith('kind', 'confusable')
    expect(gists.eq).toHaveBeenCalledWith('status', 'published')
  })
})

describe('listLearnerGists', () => {
  it('takes the first sense\'s first openly licensed example', async () => {
    const ex = (order: number, text: string, sourceId: number | null, license: string | null) => ({
      example_order: order, text, reading: null, vi: `vi ${text}`, source_example_id: sourceId,
      examples: sourceId === null ? null : { sources: { license } },
    })
    const rows = queryBuilder({ data: [{
      entry_id: 'zh:学习', gist_vi: ['học', 'học tập'],
      learner_senses: [
        { sense_order: 2, learner_examples: [ex(1, 'second sense', null, null)] },
        { sense_order: 1, learner_examples: [ex(2, 'written', null, null), ex(1, 'closed', 7, 'proprietary')] },
      ],
    }], error: null })
    const client = { schema: vi.fn(() => ({ from: vi.fn(() => rows) })) } as unknown as SupabaseClient
    const out = await listLearnerGists(client, ['zh:学习'])
    expect(out.get('zh:学习')).toEqual({
      gist: ['học', 'học tập'],
      example: { text: 'written', reading: null, vi: 'vi written', byModel: true },
    })
  })
})
