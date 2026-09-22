import { describe, it, expect, vi } from 'vitest'
import { getEntriesByLetter, isBrowseLetter, BROWSE_LETTERS } from '@/lib/dictionary/browse'
import { clientReturning } from './helpers/supabase'

function previewRow(headword: string) {
  return {
    id: `en:${headword}`, lang: 'en', headword, traditional: null, level: null, frequency_rank: 1,
    attributes: {}, senses: [], pronunciations: [],
  }
}

/** The range bounds are the whole point of this module, so the test captures `gte`/`lt`
 *  rather than letting the generic builder swallow them. */
function mockClient(rows: ReturnType<typeof previewRow>[]) {
  const gte = vi.fn()
  const lt = vi.fn()
  const range = vi.fn(() => Promise.resolve({ data: rows, error: null, count: rows.length }))
  const built = clientReturning(null, null, {
    gte: (...args: unknown[]) => { gte(...args); return built.builder },
    lt: (...args: unknown[]) => { lt(...args); return built.builder },
    range,
  })
  return { client: built.client, gte, lt }
}

describe('isBrowseLetter', () => {
  it('accepts the twenty-six lowercase letters and nothing else', () => {
    expect(BROWSE_LETTERS).toHaveLength(26)
    expect(isBrowseLetter('k')).toBe(true)
    expect(isBrowseLetter('K')).toBe(false)
    expect(isBrowseLetter('1')).toBe(false)
    expect(isBrowseLetter('')).toBe(false)
  })
})

describe('getEntriesByLetter', () => {
  it('asks for a half-open range over the headword, not a like pattern', async () => {
    const { client, gte, lt } = mockClient([previewRow('keep')])
    const page = await getEntriesByLetter(client, 'en', 'k')
    expect(gte).toHaveBeenCalledWith('headword_normalized', 'k')
    expect(lt).toHaveBeenCalledWith('headword_normalized', 'l')
    expect(page.items.map((e) => e.headword)).toEqual(['keep'])
    expect(page.total).toBe(1)
  })

  it('ranges over the pinyin for Chinese, which carries no Latin headword', async () => {
    const { client, gte, lt } = mockClient([])
    await getEntriesByLetter(client, 'zh', 'z')
    expect(gte).toHaveBeenCalledWith('pinyin_toneless', 'z')
    // The character above 'z', so the last letter is not a special case in the caller.
    expect(lt).toHaveBeenCalledWith('pinyin_toneless', '{')
  })
})
