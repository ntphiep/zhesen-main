import { describe, it, expect } from 'vitest'
import type { DictEntryPreview, DictSense } from '@/lib/dictionary/types'
import { firstTerm, leadSense, phraseItem, type Answers } from '@/lib/home/landing'

const sense = (order: number, more: Partial<DictSense>): DictSense => ({
  pos: 'verb', glossVi: null, glossEn: null, senseOrder: order, ...more,
})
const hit = (id: string, headword: string): DictEntryPreview => ({
  id, lang: id.startsWith('zh') ? 'zh' : 'es', headword, traditional: null, level: null, ipa: null, pos: null,
  glossVi: null, glossEn: null, audioUrl: null,
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
  const detail = { id: 'en:turn off', headword: 'turn off', attributes: { translations: { es: ['apagar', 'cerrar'] } } }
  const answers: Answers = { en: [], zh: [hit('zh:关', '关')], es: [hit('es:apagado', 'apagado'), hit('es:cerrar', 'cerrar'), hit('es:apagar', 'apagar')] }

  it('links the first Chinese answer and the first Spanish answer that is also a translation', () => {
    expect(phraseItem(detail, 'turn', 'tắt', answers)).toEqual({
      headword: 'turn off', particle: 'off', href: '/dictionary/en/turn%20off', vi: 'tắt',
      zh: { text: '关', href: '/dictionary/zh/%E5%85%B3' },
      es: { text: 'cerrar', href: '/dictionary/es/cerrar' },
    })
  })

  it('keeps the first Spanish translation unlinked when the lookup returned none of them', () => {
    const item = phraseItem(detail, 'turn', 'tắt', { en: [], zh: [], es: [hit('es:ir', 'ir')] })
    expect(item.es).toEqual({ text: 'apagar', href: null })
    expect(item.zh).toBeNull()
  })

  it('has no Spanish when the entry carries no translations', () => {
    expect(phraseItem({ ...detail, attributes: {} }, 'turn', 'tắt', null).es).toBeNull()
  })
})
