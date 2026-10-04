import { describe, it, expect } from 'vitest'
import { exampleCandidates, isPlausibleDerived, knownWordExamples, mainSenses, MAX_OTHER_EXAMPLES, planExamples, relatedTabs, senseSections, summaryLine } from '@/lib/dictionary/wordPage'
import { capExamples, MAX_UNLINKED_EXAMPLES } from '@/lib/dictionary/entryDetail'
import { parseSenseFrequency } from '@/lib/dictionary/rows'
import { tokenize } from '@/lib/reader/tokenize'
import type { DictExample, DictSense } from '@/lib/dictionary/types'

const sense = (over: Partial<DictSense> & { senseOrder: number }): DictSense =>
  ({ pos: 'verb', glossVi: null, glossEn: null, ...over })
const example = (text: string, over: Partial<DictExample> = {}): DictExample =>
  ({ text, reading: null, translationVi: null, translationEn: null, ...over })

describe('parseSenseFrequency', () => {
  it('reads "1" to "5" and nothing else', () => {
    expect(parseSenseFrequency(' 2 ')).toBe(2)
    for (const raw of ['0', '6', '1.5', 'high', '', null, undefined]) expect(parseSenseFrequency(raw)).toBeNull()
  })
})

describe('senseSections', () => {
  // casa listed "inflection of casar:" as a meaning, and did the ISO 639 code of Dida.
  it('leaves out a Wiktionary heading and a language code beside real meanings', () => {
    const casa = senseSections([
      sense({ senseOrder: 1, pos: 'noun', glossVi: 'nhà', glossEn: 'house' }),
      sense({ senseOrder: 2, glossEn: 'inflection of casar:' }),
      sense({ senseOrder: 3, pos: 'noun', glossEn: 'ISO 639-3 code for Dida' }),
    ])
    expect(casa.flatMap((s) => s.senses.map((x) => x.senseOrder))).toEqual([1])
    const code = senseSections([sense({ senseOrder: 1, pos: 'noun', glossEn: 'ISO 639-3 code for Dida' })])
    expect(code.flatMap((s) => s.senses.map((x) => x.senseOrder))).toEqual([1])
  })

  // Dictionary order put a cricket meaning fourth on take; the rank is what a learner meets.
  it('orders a part of speech by rank, then by Vietnamese gloss, then dictionary order', () => {
    const [verb, noun] = senseSections([
      sense({ senseOrder: 1, glossEn: 'cricket catch' }),
      sense({ senseOrder: 2, glossVi: 'mang đi' }),
      sense({ senseOrder: 3, glossVi: 'cầm', senseFrequency: 1 }),
      sense({ senseOrder: 4, pos: 'noun', glossVi: 'cảnh quay' }),
    ])
    expect(verb.labelVi).toBe('Động từ')
    expect(verb.senses.map((s) => s.senseOrder)).toEqual([3, 2, 1])
    expect(noun.anchor).toBe('pos-noun')
  })
  it('keeps classifier notes out of the meanings', () => {
    expect(senseSections([sense({ senseOrder: 1, pos: null, glossEn: 'CL:個|个[ge4]' })])).toEqual([])
  })
})

describe('summaryLine', () => {
  it('joins the first term of each shown sense, keeping a comma inside parentheses', () => {
    const sections = senseSections([
      sense({ senseOrder: 1, glossVi: 'Cầm, nắm' }),
      sense({ senseOrder: 2, glossVi: 'Đi (xe, tàu)' }),
      sense({ senseOrder: 3, glossVi: 'cầm' }),
    ])
    expect(summaryLine(sections)).toBe('Cầm\u00a0– Đi (xe, tàu)')
  })
})

describe('planExamples', () => {
  const sections = senseSections([sense({ senseOrder: 1, id: 's1', glossVi: 'cầm' })])

  it('puts every example under "Ví dụ khác" while none is linked, translated ones first', () => {
    const plan = planExamples(sections, [example('Take it.'), example('Take one.', { translationVi: 'Lấy một cái.' })], [])
    expect(plan.bySense).toEqual({})
    expect(plan.others.map((e) => e.text)).toEqual(['Take one.', 'Take it.'])
  })
  it('shows one linked example per sense, preferring a real translation', () => {
    const plan = planExamples(sections, [
      example('Take it.', { senseId: 's1', translationVi: 'cầm' }),
      example('Take my hand.', { senseId: 's1', translationVi: 'Nắm tay tôi.' }),
    ], ['cầm'])
    expect(plan.bySense.s1.text).toBe('Take my hand.')
    expect(plan.others.map((e) => e.text)).toEqual(['Take it.'])
  })
})

describe('capExamples', () => {
  it('keeps two rows per sense and the first unlinked rows', () => {
    const rows = [
      ...['a', 'b', 'c'].map((t) => example(t, { senseId: 'en:take#10' })),
      example('d', { senseId: 'en:take#2' }),
      ...Array.from({ length: MAX_UNLINKED_EXAMPLES + 5 }, (_, i) => example(`u${i}`)),
    ]
    const kept = capExamples(rows)
    expect(kept.filter((e) => e.senseId).map((e) => e.text)).toEqual(['a', 'b', 'd'])
    expect(kept.filter((e) => !e.senseId)).toHaveLength(MAX_UNLINKED_EXAMPLES)
  })
})

describe('exampleCandidates', () => {
  // Sense 6 is past the fold, so its sentence would have to resolve from the browser.
  it('takes the first linked sentence of each shown sense, then a capped run of others', () => {
    const sections = senseSections(Array.from({ length: 6 }, (_, i) => sense({ senseOrder: i + 1, id: `s${i + 1}`, glossVi: 'x' })))
    const out = exampleCandidates(sections, [
      example('Take one.', { senseId: 's1' }),
      example('Take one again.', { senseId: 's1' }),
      example('Take six.', { senseId: 's6' }),
      ...Array.from({ length: MAX_OTHER_EXAMPLES + 3 }, (_, i) => example(`Other ${i}.`)),
    ])
    expect(out[0].text).toBe('Take one.')
    expect(out.map((e) => e.text)).not.toContain('Take six.')
    expect(out.map((e) => e.text)).not.toContain('Take one again.')
    expect(out).toHaveLength(1 + MAX_OTHER_EXAMPLES)
  })
  it('falls back on a second linked sentence when there is nothing unlinked', () => {
    const sections = senseSections([sense({ senseOrder: 1, id: 's1', glossVi: 'x' })])
    const out = exampleCandidates(sections, [example('Take one.', { senseId: 's1' }), example('Take two.', { senseId: 's1' })])
    expect(out.map((e) => e.text)).toEqual(['Take one.', 'Take two.'])
  })
})

describe('knownWordExamples', () => {
  it('drops a sentence with a long word the dictionary does not know, and keeps Chinese', () => {
    const text = 'Stand on holyground.'
    const resolved = [{ text, segments: tokenize('en', text), entries: [], chars: [] }]
    expect(knownWordExamples([example(text)], resolved, 'en')).toEqual([])
    expect(knownWordExamples([example(text)], [], 'en')).toHaveLength(1)
  })
})

describe('relatedTabs', () => {
  const base = { lang: 'en' as const, headword: 'take', lemma: null, containing: [], kin: [], formTexts: [], previews: {} }

  it('drops a derived word that shares nothing with the stem', () => {
    expect(isPlausibleDerived('thou', 'take')).toBe(false)
    expect(isPlausibleDerived('mistake', 'take')).toBe(true)
    expect(isPlausibleDerived('happiness', 'happy')).toBe(true)
    expect(isPlausibleDerived('comida', 'comer')).toBe(true)
    expect(isPlausibleDerived('speech', 'speak')).toBe(true)
  })
  it('lists an item once, in the first tab it fits, and never an inflected form', () => {
    const tabs = relatedTabs({
      ...base,
      formTexts: ['takes', 'took'],
      containing: [{ id: 'en:take up', headword: 'take up', glossVi: 'bắt đầu', glossEn: null }],
      kin: [{ id: 'en:takes', headword: 'takes', glossVi: null, glossEn: null }, { id: 'en:takeoff', headword: 'takeoff', glossVi: null, glossEn: null }],
      relations: [
        { relationType: 'derived', relatedText: 'take up', relatedEntryId: null },
        { relationType: 'derived', relatedText: 'thou', relatedEntryId: null },
        { relationType: 'derived', relatedText: 'mistake', relatedEntryId: null },
        { relationType: 'synonym', relatedText: 'mistake', relatedEntryId: null },
        { relationType: 'synonym', relatedText: 'grab', relatedEntryId: null },
      ],
    })
    expect(tabs.map((t) => [t.label, t.items.map((i) => i.text)])).toEqual([
      ['Cụm từ', ['take up']],
      ['Phái sinh', ['takeoff', 'mistake']],
      ['Cận nghĩa', ['grab']],
    ])
    expect(tabs[0].items[0]).toMatchObject({ href: '/dictionary/en/take%20up', gloss: 'bắt đầu', entry: true })
  })
  it('shows collocations first, and a phrase listed there leaves the other tabs', () => {
    const tabs = relatedTabs({
      ...base,
      headword: 'decision',
      previews: { 'make a decision': {
        matchText: 'make a decision', id: 'en:make a decision', headword: 'make a decision', pos: null,
        ipa: null, reading: null, gender: null, glossVi: 'ra quyết định', glossEn: null,
      } },
      relations: [
        { relationType: 'derived', relatedText: 'make a decision', relatedEntryId: null },
        { relationType: 'collocation', relatedText: 'make a decision', relatedEntryId: 'en:make a decision' },
        { relationType: 'collocation', relatedText: 'final decision', relatedEntryId: null },
      ],
    })
    expect(tabs.map((t) => [t.label, t.items.map((i) => i.text)])).toEqual([
      ['Kết hợp từ', ['make a decision', 'final decision']],
    ])
    expect(tabs[0].items[0]).toMatchObject({ href: '/dictionary/en/make%20a%20decision', gloss: 'ra quyết định' })
  })
  it('flags an English gloss standing in for a Vietnamese one', () => {
    const tabs = relatedTabs({
      ...base,
      containing: [
        { id: 'en:take up', headword: 'take up', glossVi: 'bắt đầu', glossEn: 'To begin' },
        { id: 'en:take over', headword: 'take over', glossVi: null, glossEn: 'To assume control' },
      ],
      relations: [],
    })
    expect(tabs[0].items.map((i) => [i.text, i.gloss, i.glossIsEnglish])).toEqual([
      ['take up', 'bắt đầu', false],
      ['take over', 'To assume control', true],
    ])
  })
})

describe('old and vulgar senses', () => {
  // went led with the obsolete noun "Con đường"; stacked's main card held "Nở nang".
  const went = [
    sense({ senseOrder: 1, pos: 'noun', glossVi: 'Con đường', register: 'obsolete' }),
    sense({ senseOrder: 2, glossVi: 'Quá khứ của go', senseFrequency: 1 }),
    sense({ senseOrder: 3, glossVi: 'Quá khứ của wend', register: 'archaic' }),
  ]

  it('never lead a section or the page', () => {
    const sections = senseSections(went)
    expect(sections.map((s) => s.key)).toEqual(['verb', 'noun'])
    expect(sections[0].senses.map((s) => s.senseOrder)).toEqual([2, 3])
    const rare = senseSections([
      sense({ senseOrder: 1, glossVi: 'Thô tục', register: 'slang,vulgar', senseFrequency: 1 }),
      sense({ senseOrder: 2, glossVi: 'Xếp chồng' }),
    ])
    expect(rare[0].senses[0].senseOrder).toBe(2)
  })

  it('stay out of the main card and the summary while the entry has other senses', () => {
    const sections = senseSections(went)
    expect(mainSenses(sections).flatMap((g) => g.senses).map((s) => s.senseOrder)).toEqual([2])
    expect(summaryLine(sections)).toBe('Quá khứ của go')
    const onlyOld = senseSections([sense({ senseOrder: 1, glossVi: 'Cổ', register: 'archaic' })])
    expect(mainSenses(onlyOld).flatMap((g) => g.senses)).toHaveLength(1)
  })
})
