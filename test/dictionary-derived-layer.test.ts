import { describe, it, expect } from 'vitest'
import { CASA_SENSES, DA_SENSES, DOG_SENSES, WARRANTY_LAYER_ROW, WARRANTY_SENSES } from './helpers/learner'
import { coreBudget, deriveLearnerLayer, type DerivedLayerInput } from '@/lib/dictionary/derivedLayer'
import { minorSenses, parseLearnerLayer } from '@/lib/dictionary/learner'
import { mainSenses, senseSections } from '@/lib/dictionary/wordPage'
import { buildWordView } from '@/lib/dictionary/wordView'
import type { DictEntryDetail, DictSense, TermPreview } from '@/lib/dictionary/types'

const derive = (senses: DictSense[], over: Partial<DerivedLayerInput> = {}) => deriveLearnerLayer({
  entryId: 'en:x', lang: 'en', senses, examplesBySense: {}, glosses: [], senseSynonyms: [], previews: {}, ...over,
})
/** The raw sense orders the main senses came from. */
const orders = (senses: DictSense[], over: Partial<DerivedLayerInput> = {}) =>
  derive(senses, over)?.senses.map((s) => senses.find((r) => r.id === s.sourceSenseIds[0])?.senseOrder)

const entry = (senses: DictSense[]): DictEntryDetail => ({
  id: 'en:x', lang: 'en', headword: 'x', traditional: null, level: null, ipa: null, pos: null, glossVi: null, glossEn: null,
  audioUrl: null, senses, pronunciations: [], examples: [], relations: [], attributes: {}, senseLinks: [],
})

describe('coreBudget', () => {
  it('stays inside the ranges the AI layer uses', () => {
    expect([0, 1, 3, 4, 9, 10, 40, 41, 100].map(coreBudget)).toEqual([0, 1, 3, 3, 3, 5, 5, 7, 7])
  })
})

describe('deriveLearnerLayer', () => {
  it('leads with the overview\'s main senses', () => {
    const overview = mainSenses(senseSections(DOG_SENSES)).flatMap((g) => g.senses.map((s) => s.id))
    expect(derive(DOG_SENSES)?.senses.slice(0, 4).map((s) => s.sourceSenseIds[0])).toEqual(overview)
  })

  it('takes the first sense of every part of speech, then the leading one: dog', () => {
    expect(orders(DOG_SENSES)).toEqual([1, 3, 23, 30, 4])
    const layer = derive(DOG_SENSES)
    expect(layer?.source).toBe('dictionary')
    expect(layer?.senses.map((s) => s.order)).toEqual([1, 2, 3, 4, 5])
    expect(layer?.senses[1].viTerms).toEqual(['Chó đực', 'con đực'])
    expect(layer?.gistVi).toEqual(['Con chó', 'Chó đực', 'Đuổi theo'])
  })

  it('keeps casa\'s forms of casar out of the main senses', () => {
    const layer = derive(CASA_SENSES)!
    expect(orders(CASA_SENSES)).toEqual([1])
    expect(layer.senses[0].viTerms).toEqual(['Nhà ở', 'căn nhà', 'tòa nhà'])
    expect(layer.senses[0].viDefinition).toBe('Nhà ở, căn nhà, tòa nhà; chỗ ở.')
    const { other, inflections } = minorSenses(layer, CASA_SENSES)
    expect(other).toEqual([])
    expect(inflections.map((m) => [m.senseId, m.lemma])).toEqual([['es:casa#3', 'casar'], ['es:casa#4', 'casar']])
  })

  it('leaves out 打\'s Taiwan pronunciation note', () => {
    expect(orders(DA_SENSES, { lang: 'zh' })).toEqual([1, 2, 3])
    const { other } = minorSenses(derive(DA_SENSES, { lang: 'zh' })!, DA_SENSES)
    expect(other.map((m) => m.senseId)).toEqual(['zh:打:s6', 'zh:打:s1', 'zh:打:s2'])
  })

  it('names an English-only sense by its first clause, with no definition', () => {
    const first = derive(WARRANTY_SENSES)!.senses[0]
    expect(first.viTerms).toEqual(['A guarantee that a certain outcome or obligation will be fulfilled'])
    expect(first.viDefinition).toBe('')
    expect(first.pivot).toBe(false)
    expect(derive(WARRANTY_SENSES)!.gistVi).toEqual([])
  })

  it('marks a meaning that came through the English pivot', () => {
    const [s] = derive([{ id: 'es:x#1', pos: 'noun', glossVi: null, pivotVi: 'nhà', glossEn: 'house', senseOrder: 1 }])!.senses
    expect(s.viTerms).toEqual(['nhà'])
    expect(s.pivot).toBe(true)
  })

  it('shows the planned example only when it is translated', () => {
    const senses: DictSense[] = [{ id: 'en:x#1', pos: 'noun', glossVi: 'nhà', glossEn: 'A house.', senseOrder: 1 }]
    const example = { text: 'A big house.', reading: null, translationEn: null, senseId: 'en:x#1' }
    const withVi = derive(senses, { examplesBySense: { 'en:x#1': { ...example, translationVi: 'Một ngôi nhà lớn.' } } })
    expect(withVi?.senses[0].examples.map((x) => x.vi)).toEqual(['Một ngôi nhà lớn.'])
    expect(derive(senses, { examplesBySense: { 'en:x#1': { ...example, translationVi: null } } })?.senses[0].examples).toEqual([])
    const copied = { examplesBySense: { 'en:x#1': { ...example, translationVi: 'nhà' } }, glosses: ['nhà'] }
    expect(derive(senses, copied)?.senses[0].examples).toEqual([])
  })

  it('gives no layer to took, a form of take with no meaning of its own', () => {
    const took: DictSense[] = [{ id: 'en:took#1', pos: 'verb', glossVi: null, glossEn: 'simple past of take', senseOrder: 1 }]
    const take = { id: 'en:take', headword: 'take' } as TermPreview
    expect(derive(took, { previews: { take } })).toBeNull()
  })

  it('links a form sense to its lemma beside a real meaning', () => {
    const senses: DictSense[] = [
      { id: 'es:x#1', pos: 'noun', glossVi: 'nhà', glossEn: 'house', senseOrder: 1 },
      { id: 'es:x#2', pos: 'verb', glossVi: null, glossEn: 'third-person singular present indicative of casar', senseOrder: 2 },
    ]
    const casar = { id: 'es:casar', headword: 'casar' } as TermPreview
    const layer = derive(senses, { lang: 'es', previews: { casar } })!
    expect(minorSenses(layer, senses).inflections.map((m) => [m.lemma, m.lemmaEntryId])).toEqual([['casar', 'es:casar']])
  })

  it('gives no layer to an entry whose senses are all notes or forms', () => {
    const notes: DictSense[] = [{ id: 'zh:x:s1', pos: null, glossVi: null, glossEn: 'variant of 着[zhe5]', senseOrder: 1 }]
    expect(derive(notes, { lang: 'zh' })).toBeNull()
    const casas: DictSense[] = [{ id: 'es:casas#1', pos: 'noun', glossVi: null, glossEn: 'plural of casa', senseOrder: 1 }]
    expect(derive(casas, { lang: 'es' })).toBeNull()
  })

  it('reads a CC-CEDICT label before "of" as a meaning', () => {
    const senses: DictSense[] = [
      { id: 'zh:a:s1', pos: null, glossVi: 'Lâu đời', glossEn: '(idiom) of long standing; with a long history', senseOrder: 1 },
    ]
    expect(derive(senses, { lang: 'zh' })?.senses.map((s) => s.viTerms)).toEqual([['Lâu đời']])
    const laji: DictSense[] = [
      { id: 'zh:b:s1', pos: null, glossVi: 'Rác', glossEn: 'trash; refuse; garbage', senseOrder: 1 },
      { id: 'zh:b:s4', pos: null, glossVi: 'Kém chất lượng', glossEn: '(coll.) of poor quality', senseOrder: 4 },
    ]
    const layer = derive(laji, { lang: 'zh' })!
    expect(layer.senses).toHaveLength(2)
    expect(layer.labels.every((l) => !l.isInflection)).toBe(true)
  })

  it('keeps an English "Used in" sense as a meaning, and drops the note only in Chinese', () => {
    const have: DictSense[] = [
      { id: 'h1', pos: 'verb', glossVi: 'Có', glossEn: 'To possess, own, hold.', senseOrder: 1 },
      { id: 'h2', pos: 'verb', glossVi: 'Đã', glossEn: 'Used in forming the perfect aspect.', senseOrder: 2 },
    ]
    expect(derive(have)?.senses.map((s) => s.viTerms)).toEqual([['Có'], ['Đã']])
    expect(orders(DA_SENSES, { lang: 'zh' })).toEqual([1, 2, 3])
  })

  it('names an English-only sense after its leading labels', () => {
    const soak: DictSense[] = [{ id: 's1', pos: 'verb', glossVi: null, glossEn: '(slang, boxing) To hit or strike.', senseOrder: 1 }]
    expect(derive(soak)?.senses[0].viTerms).toEqual(['To hit or strike'])
    const two: DictSense[] = [{ id: 's2', pos: 'noun', glossVi: null, glossEn: '(informal) (UK) A cup of tea, a brew.', senseOrder: 1 }]
    expect(derive(two)?.senses[0].viTerms).toEqual(['A cup of tea'])
  })

  it('marks a model-written example and keeps its dataset', () => {
    const senses: DictSense[] = [{ id: 'en:x#1', pos: 'noun', glossVi: 'nhà', glossEn: 'A house.', senseOrder: 1 }]
    const example = { text: 'A big house.', reading: null, translationVi: 'Một ngôi nhà lớn.', translationEn: null, senseId: 'en:x#1' }
    const of = (sourceId: string) => derive(senses, { examplesBySense: { 'en:x#1': { ...example, sourceId } } })!.senses[0].examples[0]
    expect([of('zhesen-ai').byModel, of('zhesen-ai').sourceId]).toEqual([true, 'zhesen-ai'])
    expect([of('tatoeba').byModel, of('tatoeba').sourceId]).toEqual([false, 'tatoeba'])
  })
})

describe('buildWordView learner layer', () => {
  it('keeps a published AI layer', () => {
    const layer = parseLearnerLayer(WARRANTY_LAYER_ROW)
    expect(buildWordView({ detail: entry(WARRANTY_SENSES), characters: [], siblings: [], learner: layer }).learner).toBe(layer)
  })

  it('derives one when there is none, and none for an entry without senses', () => {
    expect(buildWordView({ detail: entry(WARRANTY_SENSES), characters: [], siblings: [] }).learner?.source).toBe('dictionary')
    expect(buildWordView({ detail: entry([]), characters: [], siblings: [] }).learner).toBeNull()
  })
})
