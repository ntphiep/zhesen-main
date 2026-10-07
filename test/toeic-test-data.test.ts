import { describe, it, expect } from 'vitest'
import { TOEIC_TESTS } from '@/lib/practice/toeic/tests'
import { evidenceAt, gapAt, linesAround, packWords, passageBlocks, rangesIn, resolveFromWords, tappableTexts, unpackWords } from '@/lib/practice/toeic/passage'
import type { DictEntryPreview } from '@/lib/dictionary/types'

describe.each(TOEIC_TESTS.map((t) => [t.id, t] as const))('TOEIC test %s', (_, test) => {
  const questions = test.groups.flatMap((g) => g.questions.map((q) => ({ g, q })))

  it('holds 100 questions numbered 101 to 200 in order', () => {
    expect(questions.map(({ q }) => q.number)).toEqual(Array.from({ length: 100 }, (_, i) => 101 + i))
  })

  it('has 30, 16 and 54 questions in Parts 5, 6 and 7', () => {
    const count = (part: number) => questions.filter(({ g }) => g.part === part).length
    expect([count(5), count(6), count(7)]).toEqual([30, 16, 54])
  })

  it('names each group by its part and first question', () => {
    for (const g of test.groups) expect(g.id).toBe(`p${g.part}-${g.questions[0].number}`)
  })

  it('gives every question four distinct options and a key among them', () => {
    for (const { q } of questions) {
      expect(new Set(q.options).size, `question ${q.number}`).toBe(4)
      expect(q.answer).toBeGreaterThanOrEqual(0)
      expect(q.answer).toBeLessThanOrEqual(3)
    }
  })

  it('quotes every evidence from its own group, and none in Part 5', () => {
    for (const { g, q } of questions) {
      if (g.part === 5) {
        expect(q.evidence, `question ${q.number}`).toBe('')
        expect(q.stem).toContain('-------')
      } else {
        expect(evidenceAt(g, q), `question ${q.number}: ${q.evidence}`).not.toBeNull()
      }
    }
  })

  it('writes a gap in the passage for every Part 6 question', () => {
    for (const { g, q } of questions.filter(({ g }) => g.part === 6)) {
      if (!q.stem) expect(gapAt(g, q.number), `question ${q.number}`).not.toBeNull()
    }
  })

  it('draws every passage back to its own text', () => {
    for (const g of test.groups) {
      for (const p of g.passages) {
        for (const b of passageBlocks(p.text)) {
          const pieces = b.kind === 'text' ? [b.piece] : b.kind === 'chat' ? b.lines.map((l) => l.msg) : b.rows.flat()
          for (const piece of pieces) expect(p.text.slice(piece.from, piece.from + piece.text.length)).toBe(piece.text)
        }
      }
    }
  })
})

describe('passageBlocks', () => {
  it('splits paragraphs, tables and chat lines', () => {
    const text = 'To: All Staff\nSubject: Hi\n\nItem | Price\nPen | $2\n\nAna (9:42 A.M.)\tHello there.\nBo (9:43 A.M.)\tHi.'
    const blocks = passageBlocks(text)
    expect(blocks.map((b) => b.kind)).toEqual(['text', 'table', 'chat'])
    expect(blocks[0]).toEqual({ kind: 'text', piece: { text: 'To: All Staff\nSubject: Hi', from: 0 } })
    expect(blocks[1]).toMatchObject({ rows: [[{ text: 'Item' }, { text: 'Price' }], [{ text: 'Pen' }, { text: '$2' }]] })
    expect(blocks[2]).toMatchObject({ lines: [{ who: 'Ana (9:42 A.M.)', msg: { text: 'Hello there.' } }, { who: 'Bo (9:43 A.M.)' }] })
  })

  it('moves a range of the passage into a piece of it', () => {
    expect(rangesIn({ text: 'Pen', from: 40 }, [[38, 42], [50, 60]])).toEqual([[0, 2]])
  })

  it('quotes the whole line around a range', () => {
    const text = 'One line.\nThe proof is here.\nLast.'
    const from = text.indexOf('proof')
    expect(linesAround(text, [from, from + 5])).toEqual({ text: 'The proof is here.', from: 10 })
  })
})

describe('the word list a test page sends', () => {
  const ship: DictEntryPreview = {
    id: 'en:ship', lang: 'en', headword: 'ship', traditional: null, level: 'A2',
    ipa: null, pos: 'verb', glossVi: 'gửi hàng', glossEn: null, audioUrl: null,
  }

  it('keeps each word once and rebuilds any text from it', () => {
    const packed = packWords([
      { text: 'We ship.', segments: [], entries: [['ship', ship]], chars: [] },
      { text: 'Ship it.', segments: [], entries: [['ship', ship]], chars: [] },
    ])
    expect(packed).toHaveLength(1)
    const words = unpackWords(packed)
    expect(words.get('ship')).toEqual(ship)
    const resolved = resolveFromWords(words, 'Ship it.')
    expect(resolved.entries).toEqual([['ship', ship]])
    expect(resolved.segments.map((s) => s.text).join('')).toBe('Ship it.')
  })

  it('asks for every passage, stem and option', () => {
    const texts = tappableTexts(TOEIC_TESTS[0].groups)
    expect(texts).toContain(TOEIC_TESTS[0].groups[0].questions[0].options[0])
    expect(texts).toContain(TOEIC_TESTS[0].groups.at(-1)?.passages[0].text)
  })
})
