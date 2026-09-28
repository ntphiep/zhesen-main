import { describe, it, expect } from 'vitest'
import { clientReturning } from './helpers/supabase'
import { GUARANTEE_BACKLINK_ROWS, WARRANTY_LAYER_ROW, WARRANTY_SENSES, XUEXI_LAYER_ROW } from './helpers/learner'
import {
  formDescriptionVi, getLearnerBacklinks, getLearnerLayer, isExampleReading, markHeadword, minorSenses, parseBacklinks, parseLearnerLayer, sourceNumbers,
} from '@/lib/dictionary/learner'

describe('parseLearnerLayer', () => {
  const layer = parseLearnerLayer(WARRANTY_LAYER_ROW)

  it('reads the production row for en:warranty into camelCase', () => {
    expect(layer.entryId).toBe('en:warranty')
    expect(layer.gistVi).toEqual(['bảo hành', 'sự bảo đảm'])
    expect(layer.level).toBe('B1')
    expect(layer.senses.map((s) => s.order)).toEqual([1, 2, 3])
    expect(layer.senses[0]).toMatchObject({
      pos: 'noun', viTerms: ['bảo hành', 'giấy bảo hành'], domain: 'commerce', cefr: 'B1', sourceSenseIds: ['en:warranty#5'],
    })
  })

  it('keeps which examples the model wrote itself', () => {
    expect(layer.senses[0].examples.map((x) => x.sourceExampleId)).toEqual([695065, 830277])
    expect(layer.senses[2].examples[0]).toMatchObject({
      text: 'The seller provided an expressed warranty that the house was free of structural defects.',
      sourceExampleId: null,
    })
  })

  it('files every mention under its sense and kind, in order', () => {
    const [first] = layer.senses
    expect(first.collocations.map((c) => c.text)).toEqual([
      'warranty period', 'under warranty', 'extended warranty', 'warranty expires', 'void the warranty',
    ])
    expect(first.collocations[1]).toMatchObject({
      pattern: 'prep + N', vi: 'còn trong thời hạn bảo hành', targetEntryId: 'en:under warranty',
      example: 'The phone is still under warranty.', exampleVi: 'Chiếc điện thoại vẫn còn trong thời hạn bảo hành.',
    })
    expect(first.synonyms.map((s) => s.text)).toEqual(['guarantee'])
    expect(first.equivalents.map((e) => [e.lang, e.text, e.targetEntryId])).toEqual([
      ['es', 'garantía', 'es:garantía'], ['zh', '保修', null], ['zh', '质保', null],
    ])
    expect(layer.confusables.map((c) => c.text)).toEqual(['guarantee', 'warrant'])
  })

  it('sorts an embed that arrives out of order', () => {
    const shuffled = {
      ...WARRANTY_LAYER_ROW,
      learner_senses: [...WARRANTY_LAYER_ROW.learner_senses].reverse(),
      learner_links: [...WARRANTY_LAYER_ROW.learner_links].reverse(),
    }
    const parsed = parseLearnerLayer(shuffled)
    expect(parsed.senses.map((s) => s.order)).toEqual([1, 2, 3])
    expect(parsed.senses[0].collocations[0].text).toBe('warranty period')
  })

  it('reads a Chinese layer with its pinyin', () => {
    const zh = parseLearnerLayer(XUEXI_LAYER_ROW)
    expect(zh.senses[0].examples[0]).toMatchObject({ text: '她也学习汉语。', reading: 'tā yě xuéxí hànyǔ.' })
    expect(zh.senses[0].synonyms.find((s) => s.text === '念书')?.targetEntryId).toBeNull()
  })

  it('names the phrasal verb and idiom patterns in Vietnamese', () => {
    const link = (text: string, pattern: string, link_order: number) => ({
      kind: 'collocation', lang: 'en', text, pattern, link_order, sense_order: 1, reading: null, example: null,
      vi: null, note_vi: null, example_vi: null, target_entry_id: null,
    })
    const en = parseLearnerLayer({
      ...XUEXI_LAYER_ROW,
      learner_links: [link('take off', 'phrasal verb', 1), link('take it easy', 'Idiom', 2), link('take a break', 'V + N', 3)],
    })
    expect(en.senses[0].collocations.map((c) => c.pattern)).toEqual(['cụm động từ', 'thành ngữ', 'V + N'])
  })

  it('puts a Chinese sentence reading under the example, not under the collocation', () => {
    const link = (text: string, reading: string, example: string, link_order: number) => ({
      kind: 'collocation', lang: 'zh', text, reading, example, link_order, sense_order: 1,
      vi: null, note_vi: null, pattern: null, example_vi: null, target_entry_id: null,
    })
    const zh = parseLearnerLayer({
      ...XUEXI_LAYER_ROW,
      learner_links: [
        link('学习知识', 'wǒmen yào xuéxí xīn zhīshi.', '我们要学习新知识。', 1),
        link('你好', 'nǐ hǎo', '你好！很高兴认识你。', 2),
        link('好吃', 'hǎochī', '这个菜很好吃。', 3),
      ],
    })
    expect(zh.senses[0].collocations.map((c) => [c.text, c.reading, c.exampleReading])).toEqual([
      ['学习知识', null, 'wǒmen yào xuéxí xīn zhīshi.'],
      ['你好', 'nǐ hǎo', null],
      ['好吃', 'hǎochī', null],
    ])
  })

  it('drops the CEFR level the model gave a Chinese entry', () => {
    const zh = parseLearnerLayer(XUEXI_LAYER_ROW)
    expect(zh.level).toBeNull()
    expect(zh.senses.map((s) => s.cefr)).toEqual(zh.senses.map(() => null))
    expect(parseLearnerLayer(WARRANTY_LAYER_ROW).senses[0].cefr).toBe('B1')
  })

  it('refuses a row that is not a layer', () => {
    expect(() => parseLearnerLayer({ entry_id: 'en:x' })).toThrow()
  })
})

describe('minorSenses', () => {
  it('lists the senses no core sense covers, in Wiktionary order, with their raw English', () => {
    const { other, inflections } = minorSenses(parseLearnerLayer(WARRANTY_LAYER_ROW), WARRANTY_SENSES)
    expect(other.map((m) => m.senseId)).toEqual(['en:warranty#2', 'en:warranty#3', 'en:warranty#6', 'en:warranty#7', 'en:warranty#8'])
    expect(other[4]).toMatchObject({ viTerms: ['bảo đảm'], register: 'rare', pos: 'verb', glossEn: 'To warrant; to guarantee.' })
    expect(inflections).toEqual([])
  })

  it('drops the "inflection of" heading and rows that read the same, as on es:casa', () => {
    const label = (n: number, viTerms: string[]) => ({
      senseId: `es:casa#${n}`, coreSenseOrder: null, viTerms, domain: null, register: null,
      isInflection: true, lemma: 'casar', lemmaEntryId: 'es:casar',
    })
    const sense = (n: number, glossEn: string) => ({ id: `es:casa#${n}`, pos: 'verb', glossEn, senseOrder: n })
    const { inflections } = minorSenses(
      { labels: [label(2, ['cưới', 'kết hôn']), label(3, ['cưới', 'kết hôn']), label(4, ['hãy cưới']), label(5, ['hãy cưới'])] },
      [
        sense(2, 'inflection of casar:'), sense(3, 'third-person singular present indicative'),
        sense(4, 'second-person singular imperative'), sense(5, 'second-person singular imperative'),
      ],
    )
    expect(inflections.map((m) => [m.senseId, m.glossEn])).toEqual([
      ['es:casa#3', 'third-person singular present indicative'],
      ['es:casa#4', 'second-person singular imperative'],
    ])
  })
})

describe('sourceNumbers', () => {
  it('names the Wiktionary senses by their number on the entry', () => {
    expect(sourceNumbers(['en:warranty#5', 'en:warranty#1'], WARRANTY_SENSES)).toBe('#5, #1')
    expect(sourceNumbers(['en:gone#1'], WARRANTY_SENSES)).toBe('')
  })
})

describe('parseBacklinks', () => {
  it('groups the mentions of en:guarantee by the layer that makes them', () => {
    expect(parseBacklinks(GUARANTEE_BACKLINK_ROWS)).toEqual([{
      entryId: 'en:warranty', headword: 'warranty', lang: 'en', kinds: ['confusable', 'synonym'],
      note: 'Guarantee rộng nghĩa hơn, dùng trong mọi ngữ cảnh. Warranty thường chỉ dùng cho sản phẩm hoặc trong pháp lý.',
    }])
  })
})

describe('the reads', () => {
  it('answers null for an entry with no layer', async () => {
    const { client, builder } = clientReturning(null)
    await expect(getLearnerLayer(client, 'en:dog')).resolves.toBeNull()
    expect(builder.eq).toHaveBeenCalledWith('status', 'published')
  })

  it('throws a failed read so the cache keeps nothing', async () => {
    const { client } = clientReturning(null, { message: 'relation does not exist' })
    await expect(getLearnerLayer(client, 'en:dog')).rejects.toMatchObject({ message: 'relation does not exist' })
    await expect(getLearnerBacklinks(client, 'en:dog')).rejects.toMatchObject({ message: 'relation does not exist' })
  })

  it('leaves out the entry mentioning itself', async () => {
    const { client, builder } = clientReturning(GUARANTEE_BACKLINK_ROWS)
    await expect(getLearnerBacklinks(client, 'en:guarantee')).resolves.toHaveLength(1)
    expect(builder.neq).toHaveBeenCalledWith('entry_id', 'en:guarantee')
  })
})

describe('markHeadword', () => {
  const marked = (text: string, head: string, lang: 'en' | 'es' | 'zh', forms: string[] = []) =>
    markHeadword(text, head, lang, forms).filter((p) => p.mark).map((p) => p.text)

  it('marks the headword and the forms made from it', () => {
    expect(marked('Does it come with a warranty? Warranties vary.', 'warranty', 'en')).toEqual(['warranty', 'Warranties'])
    expect(marked('She took it.', 'take', 'en', ['took'])).toEqual(['took'])
    expect(marked('Llevo la casa.', 'llevar', 'es')).toEqual(['Llevo'])
  })

  it('marks the characters of a Chinese headword', () => {
    expect(marked('她也学习汉语。', '学习', 'zh')).toEqual(['学习'])
  })

  it('does not mark a word that only contains the headword', () => {
    expect(marked('An unwarranted claim.', 'warrant', 'en')).toEqual([])
  })

  it('leaves unrelated words alone when the stem is short or the ending is not an inflection', () => {
    expect(marked('Voy a dar un paseo de noche.', 'dar', 'es', ['doy'])).toEqual(['dar'])
    expect(marked('Quiere ser su amigo.', 'ser', 'es')).toEqual(['ser'])
    expect(marked('It is good to go, and he went.', 'go', 'en', ['went'])).toEqual(['go', 'went'])
    expect(marked('The state runs the station and states it.', 'state', 'en')).toEqual(['state', 'states'])
  })
})

describe('isExampleReading', () => {
  it('tells an example sentence from the collocation reading, as the loader does', () => {
    expect(isExampleReading('学习知识', '我们要学习新知识。', 'wǒmen yào xuéxí xīn zhīshi.')).toBe(true)
    expect(isExampleReading('行了', '行了，别说了。', 'xíng le，bié shuō le')).toBe(true)
    expect(isExampleReading('你好', '你好！', 'nǐ hǎo')).toBe(false)
    expect(isExampleReading('T恤', '我买了一件T恤。', 'T xù')).toBe(false)
    expect(isExampleReading('一边…一边', '他一边吃一边看。', 'yībiān … yībiān')).toBe(false)
    expect(isExampleReading('你好', null, 'nǐ hǎo ma?')).toBe(false)
  })
})

describe('formDescriptionVi', () => {
  it('reads Wiktionary grammar terms in Vietnamese and keeps the lemma and unknown terms', () => {
    expect(formDescriptionVi('third-person singular present indicative')).toBe('ngôi thứ ba số ít hiện tại thức chỉ định')
    expect(formDescriptionVi('second-person singular imperative')).toBe('ngôi thứ hai số ít thức mệnh lệnh')
    expect(formDescriptionVi('plural of casa')).toBe('số nhiều của casa')
    expect(formDescriptionVi('past tense of take')).toBe('quá khứ của take')
    expect(formDescriptionVi('feminine singular past participle of casar')).toBe('giống cái số ít phân từ quá khứ của casar')
    expect(formDescriptionVi('second-person singular voseo imperative')).toBe('ngôi thứ hai số ít voseo thức mệnh lệnh')
  })
})
