import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/dictionary/cached', () => ({ getCachedEntryDetail: vi.fn(), getCachedInflections: vi.fn() }))
vi.mock('@/lib/theory/toeicLayer', () => ({ getCachedToeicLayer: vi.fn() }))

import { loadToeicTopic, pickLayerExample, pickToeicExample, toeicDraft, toeicPreview } from '@/lib/theory/toeicStudy'
import { getCachedEntryDetail, getCachedInflections } from '@/lib/dictionary/cached'
import { getCachedToeicLayer, type ToeicLayer } from '@/lib/theory/toeicLayer'
import type { DictEntryDetail, DictExample, DictSense } from '@/lib/dictionary/types'

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

const layer = (senses: ToeicLayer['senses'], model = 'gpt-5', reviewer: string | null = 'gemini-3-pro'): ToeicLayer =>
  ({ model, reviewer, senses })

describe('pickToeicExample', () => {
  it('gives branch the sentence of its office sense, not the tree one', () => {
    expect(pickToeicExample(detail(), 'chi nhánh')).toEqual({
      text: 'Tom is branch manager.', vi: 'Tom là giám đốc chi nhánh.', byModel: false,
    })
  })

  it('matches the test meaning as a whole term of the gloss, not a part of one', () => {
    const d = detail({
      headword: 'registration', senses: [sense('s1', 'giấy đăng ký xe')],
      examples: [example('Did you get their registration?', 'Anh có lấy giấy đăng ký xe của họ chưa?', 's1')],
    })
    expect(pickToeicExample(d, 'sự đăng ký')).toBeNull()
  })

  it('takes a sentence linked to no sense when its translation has the meaning and its English the word', () => {
    const d = detail({ examples: [example('The bank opened a branch.', 'Ngân hàng mở một chi nhánh.', null)] })
    expect(pickToeicExample(d, 'chi nhánh')?.text).toBe('The bank opened a branch.')
    const forms = detail({ examples: [example('Two branches closed.', 'Hai chi nhánh đóng cửa.', null)] })
    expect(pickToeicExample(forms, 'chi nhánh')).toBeNull()
    expect(pickToeicExample(forms, 'chi nhánh', ['branches'])?.text).toBe('Two branches closed.')
    const loose = detail({ examples: [
      example('They opened an office.', 'Họ mở một chi nhánh.', null),
      example('The bank opened a branch.', 'Ngân hàng mở một chi nhánh mới.', null, 'glosbe'),
      example('The bank opened a branch.', 'Ngân hàng mở chi nhánhh.', null),
    ] })
    expect(pickToeicExample(loose, 'chi nhánh')).toBeNull()
  })

  it('prefers a sentence linked to the sense over a shorter unlinked one', () => {
    const d = detail({ examples: [
      example('A branch shut.', 'Một chi nhánh đóng cửa.', null),
      example('Tom is branch manager.', 'Tom là giám đốc chi nhánh.', 's2'),
    ] })
    expect(pickToeicExample(d, 'chi nhánh')?.text).toBe('Tom is branch manager.')
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

  it('skips a sense of a register the test never uses, and a long quotation', () => {
    for (const register of ['obsolete', 'colloquial', 'Internet', 'slang', 'informal', 'US, dated', 'Dialectal', 'vulgar']) {
      const old = detail({
        senses: [sense('s2', 'chi nhánh', register)],
        examples: [example('Tom is branch manager.', 'Tom là giám đốc chi nhánh.', 's2')],
      })
      expect(pickToeicExample(old, 'chi nhánh'), register).toBeNull()
    }
    const formal = detail({
      senses: [sense('s2', 'chi nhánh', 'formal, US')],
      examples: [example('Tom is branch manager.', 'Tom là giám đốc chi nhánh.', 's2')],
    })
    expect(pickToeicExample(formal, 'chi nhánh')).not.toBeNull()
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
      { viTerms: ['cành cây'], examples: [{ text: 'A bird sat on a branch.', vi: 'Con chim đậu trên cành.', byModel: true }] },
      { viTerms: ['chi nhánh'], examples: [
        { text: 'Tom is branch manager.', vi: 'Tom là giám đốc chi nhánh.', byModel: false },
        { text: 'Our branch in Hanoi is new.', vi: 'Chi nhánh ở Hà Nội còn mới.', byModel: true },
      ] },
    ])
    expect(pickLayerExample(l, 'chi nhánh')).toEqual({
      text: 'Our branch in Hanoi is new.', vi: 'Chi nhánh ở Hà Nội còn mới.', byModel: true,
    })
    expect(pickLayerExample(null, 'chi nhánh')).toBeNull()
    expect(pickLayerExample(l, 'trụ sở chính')).toBeNull()
    expect(pickLayerExample(layer([{ viTerms: ['văn phòng chi nhánh'], examples: l.senses[1].examples }]), 'chi nhánh')).toBeNull()
  })

  it('never shows a sentence from a layer Claude wrote or reviewed', () => {
    const senses = [{ viTerms: ['chi nhánh'], examples: [{ text: 'Our branch is new.', vi: 'Chi nhánh còn mới.', byModel: true }] }]
    expect(pickLayerExample(layer(senses, 'ag/claude-opus-4-6-thinking'), 'chi nhánh')).toBeNull()
    expect(pickLayerExample(layer(senses, 'gpt-5', 'ag/Claude-Sonnet-4-6'), 'chi nhánh')).toBeNull()
    expect(pickLayerExample(layer(senses, 'gpt-5', null), 'chi nhánh')?.text).toBe('Our branch is new.')
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

describe('toeicDraft', () => {
  it('saves the test meaning, the sentence shown and the TOEIC tag', () => {
    const entry = toeicPreview(detail(), 'chi nhánh')
    expect(toeicDraft(entry, { text: 'Tom is branch manager.', vi: 'Tom là giám đốc chi nhánh.', byModel: false })).toMatchObject({
      entryId: 'en:branch', meaningVi: 'chi nhánh', example: 'Tom is branch manager.',
      exampleTranslation: 'Tom là giám đốc chi nhánh.', tags: ['toeic'],
    })
    expect(toeicDraft(entry, null)).toMatchObject({ meaningVi: 'chi nhánh', example: null, exampleTranslation: null })
  })
})

describe('loadToeicTopic', () => {
  const topic = { id: 'office', titleVi: 'Văn phòng và họp', words: [{ word: 'branch', vi: 'chi nhánh' }, { word: 'memo', vi: 'thông báo nội bộ' }] }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getCachedInflections).mockResolvedValue([])
  })

  it('shows a word with no entry by its meaning only, and reads the layer only where the dictionary has no sentence', async () => {
    vi.mocked(getCachedEntryDetail).mockImplementation(async (id) => (id === 'en:branch' ? detail() : null))
    const words = await loadToeicTopic('en', topic)
    expect(words[0].entry?.glossVi).toBe('chi nhánh')
    expect(words[0].example?.text).toBe('Tom is branch manager.')
    expect(words[0].draft).toMatchObject({ meaningVi: 'chi nhánh', example: 'Tom is branch manager.', tags: ['toeic'] })
    expect(words[1]).toEqual({ word: 'memo', vi: 'thông báo nội bộ', entry: null, example: null, draft: null })
    expect(getCachedToeicLayer).not.toHaveBeenCalled()
  })

  it('finds an unlinked sentence by an inflected form before reading the layer', async () => {
    const d = detail({ examples: [example('Two branches closed.', 'Hai chi nhánh đóng cửa.', null)] })
    vi.mocked(getCachedEntryDetail).mockImplementation(async (id) => (id === 'en:branch' ? d : null))
    vi.mocked(getCachedInflections).mockResolvedValue([{ formText: 'branches', formLabel: 'plural' }])
    const words = await loadToeicTopic('en', topic)
    expect(words[0].example?.text).toBe('Two branches closed.')
    expect(getCachedInflections).toHaveBeenCalledWith('en:branch')
    expect(getCachedToeicLayer).not.toHaveBeenCalled()
  })

  it('falls back to the layer when the dictionary has no sentence for the sense', async () => {
    vi.mocked(getCachedEntryDetail).mockResolvedValue(detail({ examples: [] }))
    vi.mocked(getCachedToeicLayer).mockResolvedValue(null)
    await loadToeicTopic('en', topic)
    expect(getCachedToeicLayer).toHaveBeenCalledWith('en:branch')
  })

  it('fails as a whole when one read fails, so no half-empty topic is cached', async () => {
    vi.mocked(getCachedEntryDetail).mockRejectedValueOnce(new Error('timeout')).mockResolvedValue(detail())
    await expect(loadToeicTopic('en', topic)).rejects.toThrow('timeout')
    vi.mocked(getCachedEntryDetail).mockResolvedValue(detail({ examples: [] }))
    vi.mocked(getCachedToeicLayer).mockRejectedValue(new Error('layer down'))
    await expect(loadToeicTopic('en', topic)).rejects.toThrow('layer down')
  })
})
