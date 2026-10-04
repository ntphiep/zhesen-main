import { describe, it, expect } from 'vitest'
import { entryMetadata } from '@/lib/dictionary/entryMetadata'
import type { DictEntryDetail, DictSense } from '@/lib/dictionary/types'

function sense(glossVi: string | null, extra: Partial<DictSense> = {}): DictSense {
  return { pos: null, glossVi, glossEn: 'an English definition', senseOrder: 0, ...extra }
}

function entry(over: Partial<DictEntryDetail>): DictEntryDetail {
  return {
    id: 'en:take', lang: 'en', headword: 'take', traditional: null, level: null, ipa: null, pos: null,
    glossVi: null, glossEn: null, audioUrl: null, senses: [], pronunciations: [], examples: [],
    relations: [], attributes: {}, ...over,
  }
}

describe('entryMetadata title', () => {
  it('asks what an English word means', () => {
    expect(entryMetadata(entry({})).title).toBe('take là gì? Nghĩa tiếng Việt')
  })
  it('names Spanish, which searchers type', () => {
    expect(entryMetadata(entry({ id: 'es:casa', lang: 'es', headword: 'casa' })).title)
      .toBe('casa tiếng Tây Ban Nha là gì? Nghĩa tiếng Việt')
  })
  it('carries the pinyin the word page shows for Chinese', () => {
    const zh = entry({
      id: 'zh:学习', lang: 'zh', headword: '学习',
      pronunciations: [{ accent: '', ipa: ' xuéxí ', audioUrl: null }],
    })
    expect(entryMetadata(zh).title).toBe('学习 (xuéxí) là gì? Nghĩa tiếng Việt')
  })
  it('falls back to the pinyin attribute, then to no parentheses', () => {
    const zh = entry({ id: 'zh:狗', lang: 'zh', headword: '狗', attributes: { pinyin: 'gǒu' } })
    expect(entryMetadata(zh).title).toBe('狗 (gǒu) là gì? Nghĩa tiếng Việt')
    expect(entryMetadata({ ...zh, attributes: {} }).title).toBe('狗 là gì? Nghĩa tiếng Việt')
  })
})

describe('entryMetadata description', () => {
  it('is one sentence of up to three distinct Vietnamese glosses, without semicolons', () => {
    const m = entryMetadata(entry({
      glossVi: 'Cầm, lấy, mang',
      senses: [sense('Cầm, lấy, mang'), sense('Cầm; nắm.'), sense(null, { pivotVi: 'Chiếm, bắt giữ' }), sense('Đưa')],
    }))
    expect(m.description).toBe('Tra nghĩa tiếng Việt của take: Cầm, lấy, mang, Cầm, nắm, Chiếm, bắt giữ.')
    expect(m.robots).toBeUndefined()
    expect(m.alternates).toEqual({ canonical: '/dictionary/en/take' })
  })
  it('never quotes an English definition', () => {
    const m = entryMetadata(entry({ glossVi: 'cầm', senses: [sense(null)] }))
    expect(m.description).toBe('Tra nghĩa tiếng Việt của take: cầm.')
  })
  it('cuts a long description at a word boundary near 155 characters', () => {
    const long = Array.from({ length: 60 }, (_, i) => `nghĩa${i}`).join(' ')
    const d = String(entryMetadata(entry({ glossVi: long })).description)
    expect(d.length).toBeLessThanOrEqual(155)
    expect(d.length).toBeGreaterThan(140)
    expect(d.endsWith('…')).toBe(true)
    expect(long.split(' ')).toContain(d.slice(0, -1).split(' ').pop())
  })
})

describe('entryMetadata without Vietnamese', () => {
  it('is noindex, follow with a plain description', () => {
    const m = entryMetadata(entry({ id: 'en:zymurgy', headword: 'zymurgy', senses: [sense(null)] }))
    expect(m.robots).toEqual({ index: false, follow: true })
    expect(m.description).toBe('Tra nghĩa của zymurgy.')
    expect(m.openGraph).toMatchObject({ siteName: 'Zhesen', locale: 'vi_VN', type: 'website' })
  })
})

describe('entryMetadata for a machine translation', () => {
  const mt = sense('Người thầy về đạo đức', { glossViSource: 'mt:google' })
  const rare = { id: 'en:moralist', headword: 'moralist', level: null, frequencyRank: 77003 }

  it('is noindex when every meaning is Google\'s translation of a rare word', () => {
    expect(entryMetadata(entry({ ...rare, glossVi: mt.glossVi, senses: [mt, sense(null)] })).robots)
      .toEqual({ index: false, follow: true })
    expect(entryMetadata(entry({ ...rare, frequencyRank: null, senses: [mt] })).robots)
      .toEqual({ index: false, follow: true })
  })
  it('stays indexed for a levelled or frequent word, or beside another meaning', () => {
    expect(entryMetadata(entry({ ...rare, level: 'B2', senses: [mt] })).robots).toBeUndefined()
    expect(entryMetadata(entry({ ...rare, frequencyRank: 50000, senses: [mt] })).robots).toBeUndefined()
    expect(entryMetadata(entry({ ...rare, senses: [mt, sense('nhà đạo đức', { glossViSource: null })] })).robots)
      .toBeUndefined()
    expect(entryMetadata(entry({ ...rare, senses: [mt, sense(null, { pivotVi: 'nhà đạo đức' })] })).robots)
      .toBeUndefined()
  })
})
