import { describe, it, expect } from 'vitest'
import {
  balanceColumns, buildWordView, groupSenses, mainSenses, splitAroundStem, splitForm, splitPhrasalVerbs, type ViewWord,
} from '@/lib/dictionary/wordView'
import { senseSections } from '@/lib/dictionary/wordPage'
import type { CharInfo, DictEntryDetail, DictSense } from '@/lib/dictionary/types'

const sense = (over: Partial<DictSense> & { senseOrder: number }): DictSense =>
  ({ pos: 'verb', glossVi: null, glossEn: null, ...over })
const word = (text: string): ViewWord => ({ text, href: `/x/${text}`, id: null, gloss: null, pos: null, level: null })
const char = (over: Partial<CharInfo> & { char: string }): CharInfo =>
  ({ radical: null, strokeCount: null, hanViet: [], pinyin: [], gloss: null, ...over })

const zhWord = (headword: string): DictEntryDetail => ({
  id: `zh:${headword}`, lang: 'zh', headword, traditional: null, level: null, ipa: null, pos: null,
  glossVi: null, glossEn: null, audioUrl: null, senses: [], pronunciations: [], examples: [],
  relations: [], attributes: {}, senseLinks: [],
})

const take: DictEntryDetail = {
  id: 'en:take', lang: 'en', headword: 'take', traditional: null, level: 'B1', ipa: null, pos: 'verb',
  glossVi: 'cầm', glossEn: 'to grab', audioUrl: null,
  senses: [
    sense({ senseOrder: 1, glossVi: 'cầm, nắm', glossEn: 'to grip', id: 'en:take#1' }),
    sense({ senseOrder: 2, glossVi: 'mang đi', glossEn: 'to carry', id: 'en:take#2' }),
    sense({ senseOrder: 3, pos: 'noun', glossVi: 'cảnh quay', id: 'en:take#3' }),
  ],
  pronunciations: [], examples: [],
  relations: [
    { relationType: 'synonym', relatedText: 'grab', relatedEntryId: null },
    { relationType: 'synonym', relatedText: 'bring', relatedEntryId: null },
    { relationType: 'synonym', relatedText: 'seize', relatedEntryId: null },
  ],
  attributes: {},
  senseLinks: [
    { text: 'grab', senseOrder: 1, targetId: 'en:grab' },
    { text: 'bring', senseOrder: 2, targetId: 'en:bring' },
  ],
}

describe('splitForm', () => {
  it('marks what an English form adds, and whether the rules explain it', () => {
    expect(splitForm('take', 'takes', 'en')).toEqual({ kept: 'take', changed: 's', irregular: false })
    expect(splitForm('take', 'taking', 'en')).toEqual({ kept: 'tak', changed: 'ing', irregular: false })
    expect(splitForm('take', 'took', 'en')).toEqual({ kept: 't', changed: 'ook', irregular: true })
    expect(splitForm('take', 'taken', 'en').irregular).toBe(true)
    expect(splitForm('stop', 'stopped', 'en').irregular).toBe(false)
    expect(splitForm('try', 'tried', 'en').irregular).toBe(false)
  })
  it('judges a phrase by the word that inflects', () => {
    expect(splitForm('take part', 'takes part', 'en')).toEqual({ kept: 'take', changed: 's part', irregular: false })
    expect(splitForm('take part', 'took part', 'en')).toEqual({ kept: 't', changed: 'ook part', irregular: true })
  })
  // fair listed "more fair" and "most fair" on the highlighter as irregular forms.
  it('never calls a comparison with more or most irregular', () => {
    expect(splitForm('fair', 'more fair', 'en').irregular).toBe(false)
    expect(splitForm('fair', 'most fair', 'en').irregular).toBe(false)
    expect(splitForm('give up', 'more give up', 'en').irregular).toBe(false)
  })
  it('never calls a form of another language irregular', () => {
    expect(splitForm('casa', 'casas', 'es')).toEqual({ kept: 'casa', changed: 's', irregular: false })
    expect(splitForm('tener', 'tuve', 'es').irregular).toBe(false)
  })
})

describe('splitAroundStem', () => {
  it('finds the stem inside the word, else the shared beginning', () => {
    expect(splitAroundStem('mistake', 'take')).toEqual({ before: 'mis', stem: 'take', after: '' })
    expect(splitAroundStem('speech', 'speak')).toEqual({ before: '', stem: 'spe', after: 'ech' })
    expect(splitAroundStem('ox', 'take')).toEqual({ before: '', stem: 'ox', after: '' })
  })
})

describe('splitPhrasalVerbs', () => {
  it('keeps the headword plus one particle apart from every other phrase', () => {
    const { phrasal, other } = splitPhrasalVerbs('take', [word('take off'), word('take care'), word('Take Up'), word('intake')])
    expect(phrasal.map((w) => [w.text, w.particle])).toEqual([['take off', 'off'], ['Take Up', 'Up']])
    expect(other.map((w) => w.text)).toEqual(['take care', 'intake'])
  })

  it('keeps a verb with two particles as a phrasal verb', () => {
    const { phrasal, other } = splitPhrasalVerbs('look', [word('look forward to'), word('look up to'), word('look a gift horse in the mouth')])
    expect(phrasal.map((w) => [w.text, w.particle])).toEqual([['look forward to', 'forward to'], ['look up to', 'up to']])
    expect(other.map((w) => w.text)).toEqual(['look a gift horse in the mouth'])
  })
})

describe('mainSenses', () => {
  it('leads with every part of speech, then fills from the first', () => {
    const groups = mainSenses(senseSections(take.senses))
    expect(groups.map((g) => g.senses.map((s) => s.senseOrder))).toEqual([[1, 2], [3]])
  })
  it('stops at the budget', () => {
    const many = Array.from({ length: 9 }, (_, i) => sense({ senseOrder: i + 1, glossVi: `n${i}` }))
    expect(mainSenses(senseSections(many), 4)[0].senses).toHaveLength(4)
  })
  // give up's US dialectal adjective "đắm chìm" was its fourth main meaning.
  it('leaves out a dialectal part of speech while the entry has a current one', () => {
    const giveUp = [
      sense({ senseOrder: 1, glossVi: 'đầu hàng' }),
      sense({ senseOrder: 2, glossVi: 'từ bỏ' }),
      sense({ senseOrder: 3, pos: 'adjective', glossVi: 'đắm chìm', register: 'US,dialectal' }),
    ]
    expect(mainSenses(senseSections(giveUp)).flatMap((g) => g.senses.map((s) => s.glossVi))).toEqual(['đầu hàng', 'từ bỏ'])
  })
})

describe('balanceColumns', () => {
  it('sends each tile to the shorter column, ties to the first', () => {
    expect(balanceColumns([3, 8, 12, 8, 25, 6])).toEqual([0, 1, 0, 1, 0, 1])
    expect(balanceColumns([4])).toEqual([0])
    expect(balanceColumns([])).toEqual([])
  })

  it('keeps a wide tile in the first column whatever the heights', () => {
    expect(balanceColumns([3, 8, 12, 8], [true, false, true, false])).toEqual([0, 1, 0, 1])
    expect(balanceColumns([10, 2, 4], [false, false, true])).toEqual([0, 1, 0])
  })
})

describe('groupSenses', () => {
  it('gathers senses under the Vietnamese term they lead with, in first-seen order', () => {
    const groups = groupSenses([
      sense({ senseOrder: 1, glossVi: 'cầm, nắm', id: 'a' }),
      sense({ senseOrder: 2, glossVi: 'chiếm lấy', id: 'b' }),
      sense({ senseOrder: 3, glossVi: 'Cầm; giữ', id: 'c' }),
      sense({ senseOrder: 4 }),
    ])
    expect(groups.map((g) => [g.label, g.senses.map((s) => s.id)])).toEqual([['cầm', ['a', 'c']], ['chiếm lấy', ['b']]])
  })
})

describe('buildWordView', () => {
  const view = buildWordView({ detail: take, characters: [], siblings: [] })

  // music printed "more music, most music" for its rare adjective "musical".
  it('drops degree forms unless a current adjective, adverb or determiner takes them', () => {
    const forms = (senses: DictSense[]) => buildWordView({
      detail: { ...take, id: 'en:music', headword: 'music', senses },
      inflections: [
        { formText: 'musics', formLabel: 'plural' },
        { formText: 'more music', formLabel: 'comparative' },
        { formText: 'most music', formLabel: 'superlative' },
      ],
      characters: [], siblings: [],
    }).forms.map((f) => f.text)
    const noun = sense({ senseOrder: 1, pos: 'noun', glossVi: 'âm nhạc' })
    expect(forms([noun, sense({ senseOrder: 2, pos: 'adjective', glossVi: 'thuộc âm nhạc', register: 'rare' })])).toEqual(['musics'])
    expect(forms([noun, sense({ senseOrder: 2, pos: 'det', glossVi: 'ít' })])).toEqual(['musics', 'more music', 'most music'])
  })

  // bumble showed sense sentences that never use bumble.
  it('shows no example that uses neither the headword nor a form of it', () => {
    const ex = (text: string, senseId: string | null) => ({ text, reading: null, translationVi: `${text} (vi)`, translationEn: null, senseId })
    const v = buildWordView({
      detail: {
        ...take,
        examples: [ex('She took the pen.', 'en:take#1'), ex('Bring it here.', 'en:take#2'), ex('That was a great take.', null), ex('Give me that.', null)],
      },
      inflections: [{ formText: 'took', formLabel: 'past' }],
      characters: [], siblings: [],
    })
    const texts = [...Object.values(v.examplesBySense), ...v.examples].map((e) => e.text)
    expect(texts).toEqual(['She took the pen.', 'That was a great take.'])
  })

  it('lists a synonym under the sense it shares a meaning with, and nowhere else', () => {
    expect(view.senseSynonyms.map((s) => [s.senseOrder, s.label, s.words.map((w) => w.text)])).toEqual([
      [1, 'cầm', ['grab']],
      [2, 'mang đi', ['bring']],
    ])
    expect(view.synonyms.map((w) => w.text)).toEqual(['seize'])
    expect(view.senseSynonyms[0].words[0]).toMatchObject({ id: 'en:grab', href: '/dictionary/en/grab' })
  })

  it('leaves a word another list already holds out of the sense synonyms', () => {
    const withPhrase = buildWordView({
      detail: {
        ...take,
        relations: [...take.relations, { relationType: 'derived', relatedText: 'take off', relatedEntryId: null }],
        senseLinks: [...(take.senseLinks ?? []), { text: 'take off', senseOrder: 1, targetId: 'en:take off' }],
      },
      characters: [], siblings: [],
    })
    expect(withPhrase.senseSynonyms[0].words.map((w) => w.text)).toEqual(['grab'])
    expect(withPhrase.phrases.map((w) => w.text)).toContain('take off')
  })

  it('puts the collocations first among the phrases', () => {
    const withCollocations = buildWordView({
      detail: {
        ...take,
        relations: [
          ...take.relations,
          { relationType: 'derived', relatedText: 'take off', relatedEntryId: null },
          { relationType: 'collocation', relatedText: 'take a break', relatedEntryId: 'en:take a break' },
        ],
      },
      characters: [], siblings: [],
    })
    expect(withCollocations.phrases.map((w) => w.text)).toEqual(['take a break', 'take off'])
  })

  it('hands the client the entry without its senses and relations', () => {
    expect(view.head.senses).toEqual([])
    expect(view.head.relations).toEqual([])
    expect(view.senses).toHaveLength(3)
  })

  it('orders the forms as a learner meets them: the -s form, the past, the participles', () => {
    const withForms = buildWordView({
      detail: take, characters: [], siblings: [],
      inflections: [
        { formText: 'taking', formLabel: 'participle present' },
        { formText: 'taken', formLabel: 'participle past' },
        { formText: 'took', formLabel: 'past' },
        { formText: 'takes', formLabel: 'present singular third-person' },
      ],
    })
    expect(withForms.forms.map((f) => f.text)).toEqual(['takes', 'took', 'taken', 'taking'])
  })

  it('names a spelling the verb and the noun share by the part of speech the entry leads with', () => {
    const inflections = [
      { formText: 'takes', formLabel: 'plural' },
      { formText: 'takes', formLabel: 'present singular third-person' },
    ]
    expect(buildWordView({ detail: take, characters: [], siblings: [], inflections }).forms[0].label).toBe('Ngôi thứ ba số ít')
    const noun = { ...take, senses: take.senses.map((s) => ({ ...s, senseOrder: s.pos === 'noun' ? 0 : s.senseOrder })) }
    expect(buildWordView({ detail: noun, characters: [], siblings: [], inflections }).forms[0].label).toBe('Số nhiều')
  })

  it('shows every reading of a single-character headword, one per character for a multi-character one', () => {
    const single = buildWordView({
      detail: zhWord('行'), characters: [char({ char: '行', hanViet: ['hàng', 'hành'] })], siblings: [],
    })
    expect(single.hanViet).toBe('hàng, hành')

    const multi = buildWordView({
      detail: zhWord('银行'),
      characters: [char({ char: '银', hanViet: ['ngân'] }), char({ char: '行', hanViet: ['hàng', 'hành'] })],
      siblings: [],
    })
    expect(multi.hanViet).toBe('ngân hàng')

    // Only 恤 of T恤 is in lex.characters; the word is not the character.
    const mixed = buildWordView({
      detail: zhWord('T恤'), characters: [char({ char: '恤', hanViet: ['tuất', 'tuật'] })], siblings: [],
    })
    expect(mixed.hanViet).toBe('tuất')
  })
})
