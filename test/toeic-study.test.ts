import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/dictionary/cached', () => ({ getCachedEntryDetail: vi.fn() }))
vi.mock('@/lib/dictionary/learnerCached', () => ({ getCachedLearnerLayer: vi.fn() }))

import { loadToeicTopic, pickLayerExample, pickToeicExample, toeicPreview } from '@/lib/theory/toeicStudy'
import { getCachedEntryDetail } from '@/lib/dictionary/cached'
import { getCachedLearnerLayer } from '@/lib/dictionary/learnerCached'
import type { DictEntryDetail, DictExample, DictSense } from '@/lib/dictionary/types'
import type { LearnerLayer, LearnerSense } from '@/lib/dictionary/learner'

const sense = (id: string, glossVi: string, register: string | null = null): DictSense =>
  ({ id, glossVi, glossEn: null, pos: 'noun', senseOrder: Number(id.slice(1)), register })

const example = (text: string, translationVi: string, senseId: string | null, sourceId: string | null = 'tatoeba'): DictExample =>
  ({ text, reading: null, translationVi, translationEn: null, senseId, sourceId })

function detail(over: Partial<DictEntryDetail> = {}): DictEntryDetail {
  return {
    id: 'en:branch', lang: 'en', headword: 'branch', traditional: null, level: 'B1', ipa: 'brɑːntʃ',
    pos: 'noun', glossVi: 'cành cây', glossEn: 'a part of a tree', audioUrl: null,
    senses: [sense('s1', 'cành cây'), sense('s2', 'chi nhánh, văn phòng chi nhánh')],
    pronunciations: [], relations: [], attributes: {},
    examples: [
      example('Birds sat on the branch.', 'Chim đậu trên cành cây.', 's1'),
      example('Tom is branch manager.', 'Tom là giám đốc chi nhánh.', 's2'),
    ],
    ...over,
  }
}

function layer(senses: Partial<LearnerSense>[]): Pick<LearnerLayer, 'senses'> {
  return {
    senses: senses.map((s, i) => ({
      order: i + 1, pos: null, viTerms: [], viDefinition: '', pivot: false, enDefinition: null, domain: null,
      register: null, cefr: null, sourceSenseIds: [], examples: [], collocations: [], synonyms: [], antonyms: [],
      equivalents: [], ...s,
    })),
  }
}

describe('pickToeicExample', () => {
  it('gives branch the sentence of its office sense, not the tree one', () => {
    expect(pickToeicExample(detail(), 'chi nhánh')).toEqual({
      text: 'Tom is branch manager.', vi: 'Tom là giám đốc chi nhánh.', byModel: false,
    })
  })

  it('never falls back to a sentence linked to no sense', () => {
    const d = detail({ examples: [example('The bank opened a branch.', 'Ngân hàng mở một chi nhánh.', null)] })
    expect(pickToeicExample(d, 'chi nhánh')).toBeNull()
  })

  it('skips a sentence from a source public pages do not show', () => {
    for (const source of ['cambridge', 'cambridge-vi', 'glosbe', null]) {
      const d = detail({ examples: [example('Tom is branch manager.', 'Tom là giám đốc chi nhánh.', 's2', source)] })
      expect(pickToeicExample(d, 'chi nhánh')).toBeNull()
    }
  })

  it('skips a sentence whose translation does not carry the test meaning', () => {
    const d = detail({
      headword: 'expire', senses: [sense('s1', 'hết hạn')],
      examples: [example('The patient expired in hospital.', 'Bệnh nhân đã qua đời trong bệnh viện.', 's1')],
    })
    expect(pickToeicExample(d, 'hết hạn')).toBeNull()
  })

  it('skips an obsolete sense and a long quotation', () => {
    const old = detail({
      senses: [sense('s2', 'chi nhánh', 'obsolete')],
      examples: [example('Tom is branch manager.', 'Tom là giám đốc chi nhánh.', 's2')],
    })
    expect(pickToeicExample(old, 'chi nhánh')).toBeNull()
    const long = 'The branch, which the company opened in the old town after a long and costly search, stayed shut.'
    const verse = detail({
      examples: [
        example(`${long} Again.`, 'Chi nhánh đóng cửa.', 's2'),
        example('The branch is near / the river’s bend.', 'Chi nhánh gần khúc sông.', 's2'),
      ],
    })
    expect(pickToeicExample(verse, 'chi nhánh')).toBeNull()
  })

  it('takes either meaning of a word written with hoặc, and labels a sentence a model wrote', () => {
    const d = detail({
      headword: 'extension', senses: [sense('s1', 'sự gia hạn')],
      examples: [example('We got an extension.', 'Chúng tôi được gia hạn.', 's1', 'zhesen-ai')],
    })
    expect(pickToeicExample(d, 'số máy lẻ hoặc sự gia hạn')).toEqual({
      text: 'We got an extension.', vi: 'Chúng tôi được gia hạn.', byModel: true,
    })
  })
})

describe('pickLayerExample', () => {
  it('takes the sentence the model wrote for the sense with the test meaning', () => {
    const l = layer([
      { viTerms: ['cành cây'], examples: [{ text: 'A bird sat on a branch.', reading: null, vi: 'Con chim đậu trên cành.', sourceExampleId: null, byModel: true, sourceId: null }] },
      { viTerms: ['chi nhánh'], examples: [
        { text: 'Tom is branch manager.', reading: null, vi: 'Tom là giám đốc chi nhánh.', sourceExampleId: 9, byModel: false, sourceId: null },
        { text: 'Our branch in Hanoi is new.', reading: null, vi: 'Chi nhánh ở Hà Nội còn mới.', sourceExampleId: null, byModel: true, sourceId: null },
      ] },
    ])
    expect(pickLayerExample(l, 'chi nhánh')).toEqual({
      text: 'Our branch in Hanoi is new.', vi: 'Chi nhánh ở Hà Nội còn mới.', byModel: true,
    })
    expect(pickLayerExample(null, 'chi nhánh')).toBeNull()
    expect(pickLayerExample(l, 'trụ sở chính')).toBeNull()
  })
})

describe('toeicPreview', () => {
  it('carries the test meaning, no examples, and only audio of the headword itself', () => {
    const p = toeicPreview(detail({ audioUrl: 'https://upload.wikimedia.org/En-us-branch.ogg' }), 'chi nhánh')
    expect(p.glossVi).toBe('chi nhánh')
    expect(p.audioUrl).toBe('https://upload.wikimedia.org/En-us-branch.ogg')
    expect('examples' in p).toBe(false)
    expect(toeicPreview(detail({ audioUrl: 'https://upload.wikimedia.org/En-uk-a_branch_office.ogg' }), 'chi nhánh').audioUrl).toBeNull()
  })
})

describe('loadToeicTopic', () => {
  const topic = { id: 'office', titleVi: 'Văn phòng và họp', words: [{ word: 'branch', vi: 'chi nhánh' }, { word: 'memo', vi: 'thông báo nội bộ' }] }

  beforeEach(() => vi.clearAllMocks())

  it('shows a word with no entry by its meaning only, and reads the layer only where the dictionary has no sentence', async () => {
    vi.mocked(getCachedEntryDetail).mockImplementation(async (id) => (id === 'en:branch' ? detail() : null))
    const words = await loadToeicTopic('en', topic)
    expect(words[0].entry?.glossVi).toBe('chi nhánh')
    expect(words[0].example?.text).toBe('Tom is branch manager.')
    expect(words[1]).toEqual({ word: 'memo', vi: 'thông báo nội bộ', entry: null, example: null })
    expect(getCachedLearnerLayer).not.toHaveBeenCalled()
  })

  it('falls back to the layer when the dictionary has no sentence for the sense', async () => {
    vi.mocked(getCachedEntryDetail).mockResolvedValue(detail({ examples: [] }))
    vi.mocked(getCachedLearnerLayer).mockResolvedValue(null)
    await loadToeicTopic('en', topic)
    expect(getCachedLearnerLayer).toHaveBeenCalledWith('en:branch')
  })

  it('fails as a whole when one read fails, so no half-empty topic is cached', async () => {
    vi.mocked(getCachedEntryDetail).mockRejectedValueOnce(new Error('timeout')).mockResolvedValue(detail())
    await expect(loadToeicTopic('en', topic)).rejects.toThrow('timeout')
  })
})
