import { describe, it, expect, vi } from 'vitest'
import type { DictEntryDetail, DictSense, TermPreview } from '@/lib/dictionary/types'

vi.mock('@/lib/dictionary/cached', () => ({ getCachedEntryDetail: vi.fn(), getCachedTermPreviews: vi.fn() }))
vi.mock('@/lib/dictionary/learnerCached', () => ({ getCachedLearnerLayer: vi.fn() }))

import { getCachedEntryDetail, getCachedTermPreviews } from '@/lib/dictionary/cached'
import { firstTerm, leadSense, loadPhrases, phraseItem } from '@/lib/home/landing'

const sense = (order: number, more: Partial<DictSense>): DictSense => ({
  pos: 'verb', glossVi: null, glossEn: null, senseOrder: order, ...more,
})
const hit = (id: string, headword: string): TermPreview => ({
  matchText: headword, id, headword, pos: null, ipa: null, reading: null, gender: null, glossVi: null, glossEn: null,
})

describe('the sense a learner meets first', () => {
  it('passes over a literal pointer and a Google translation', () => {
    const lead = leadSense([
      sense(1, { glossEn: 'Used other than figuratively or idiomatically: see turn, out.', glossVi: 'quay ra' }),
      sense(2, { glossEn: 'To end up.', glossVi: 'Kết cục', glossViSource: 'mt:google', glossViIsMt: true }),
      sense(3, { glossEn: 'To produce.', glossVi: 'sản xuất', glossViIsMt: true }),
    ])
    expect(lead?.senseOrder).toBe(3)
  })

  it('takes a reviewed gloss over a machine one, and a ranked sense over both', () => {
    const senses = [
      sense(1, { glossVi: 'trả lại', glossViIsMt: true }),
      sense(2, { glossVi: 'bật', glossViIsMt: false }),
    ]
    expect(leadSense(senses)?.senseOrder).toBe(2)
    expect(leadSense([...senses, sense(3, { glossVi: 'khởi động', glossViIsMt: true, senseFrequency: 1 })])?.senseOrder).toBe(3)
  })

  it('has none when no sense carries Vietnamese', () => {
    expect(leadSense([sense(1, { glossEn: 'To revolve.' })])).toBeNull()
  })

  it('reads the first term of a gloss in lower case', () => {
    expect(firstTerm('Từ chối, bác bỏ')).toBe('từ chối')
    expect(firstTerm('trả lại; trở lại')).toBe('trả lại')
  })
})

describe('a phrasal verb across languages', () => {
  const detail = { id: 'en:turn off', headword: 'turn off' }

  it('links the Chinese and Spanish entries picked for it', () => {
    expect(phraseItem(detail, 'turn', 'tắt', hit('zh:关', '关'), hit('es:apagar', 'apagar'))).toEqual({
      headword: 'turn off', particle: 'off', href: '/dictionary/en/turn%20off', vi: 'tắt',
      zh: { text: '关', href: '/dictionary/zh/%E5%85%B3' },
      es: { text: 'apagar', href: '/dictionary/es/apagar' },
    })
  })

  it('leaves out an equivalent the dictionary no longer holds', () => {
    const item = phraseItem(detail, 'turn', 'tắt', undefined, hit('es:apagar', 'apagar'))
    expect(item.zh).toBeNull()
    expect(item.es?.text).toBe('apagar')
  })
})

describe('the phrases section', () => {
  it('shows the sense picked for each phrase and leaves out one whose read fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(getCachedEntryDetail).mockImplementation(async (id: string) => {
      if (id === 'en:turn up') throw new Error('timeout')
      const headword = id.slice(3)
      const senses = [sense(1, { glossVi: `nghĩa 1 ${headword}`, senseFrequency: 1 }), sense(2, { glossVi: `nghĩa 2 ${headword}` })]
      return { id, headword, glossVi: 'Xoay, quay, rẽ', senses } as unknown as DictEntryDetail
    })
    vi.mocked(getCachedTermPreviews).mockImplementation(async (lang, texts) =>
      texts.map((t) => hit(`${lang}:${t}`, t)))
    const family = await loadPhrases()
    expect(family?.verbVi).toBe('xoay')
    expect(family?.phrases.map((p) => p.vi)).toEqual(['nghĩa 2 turn on', 'nghĩa 2 turn off', 'nghĩa 1 turn down', 'nghĩa 1 turn out', 'nghĩa 1 turn into'])
    expect(family?.phrases.map((p) => p.particle)).toEqual(['on', 'off', 'down', 'out', 'into'])
    expect(family?.phrases[1].es).toEqual({ text: 'apagar', href: '/dictionary/es/apagar' })
  })
})
