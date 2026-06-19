import { describe, it, expect, vi } from 'vitest'
import { parseUserWordRow, draftFromDictEntry, addWord, listWords } from '@/lib/wordlist/store'
import type { DictEntryPreview } from '@/lib/dictionary/types'

const row = {
  id: '11111111-1111-1111-1111-111111111111', lang: 'en', entry_id: 'en:dog', headword: 'dog',
  reading: null, ipa: '/dɔːɡ/', pos: 'noun', meaning_vi: 'con chó', meaning_en: 'dog', level: 'A1',
  example: 'The dog barked.', example_translation: 'Con chó sủa.', audio_url: 'x.ogg', notes: null,
  status: 'new', tags: [], created_at: '2026-06-19T00:00:00Z', updated_at: '2026-06-19T00:00:00Z',
}

describe('parseUserWordRow', () => {
  it('maps snake_case row to camelCase UserWord', () => {
    const w = parseUserWordRow(row)
    expect(w).toMatchObject({ id: row.id, entryId: 'en:dog', meaningVi: 'con chó', exampleTranslation: 'Con chó sủa.', audioUrl: 'x.ogg', status: 'new' })
  })
})

describe('draftFromDictEntry', () => {
  it('prefills a draft from a dictionary preview', () => {
    const e: DictEntryPreview = {
      id: 'en:dog', lang: 'en', headword: 'dog', traditional: null, level: 'A1',
      ipa: '/dɔːɡ/', pos: 'noun', glossVi: 'con chó', glossEn: 'dog', audioUrl: 'x.ogg',
    }
    const d = draftFromDictEntry(e)
    expect(d).toMatchObject({ entryId: 'en:dog', headword: 'dog', meaningVi: 'con chó', meaningEn: 'dog', ipa: '/dɔːɡ/', status: 'new', tags: [] })
  })
})

function mockInsert(returned: unknown) {
  const single = vi.fn(() => Promise.resolve({ data: returned, error: null }))
  const select = vi.fn(() => ({ single }))
  const insert = vi.fn(() => ({ select }))
  const order = vi.fn(() => Promise.resolve({ data: [returned], error: null }))
  const selectList = vi.fn(() => ({ order }))
  const from = vi.fn(() => ({ insert, select: selectList }))
  return { client: { from } as unknown as import('@supabase/supabase-js').SupabaseClient, insert }
}

describe('addWord', () => {
  it('inserts a draft and returns the parsed word', async () => {
    const { client, insert } = mockInsert(row)
    const w = await addWord(client, draftFromDictEntry({
      id: 'en:dog', lang: 'en', headword: 'dog', traditional: null, level: 'A1',
      ipa: '/dɔːɡ/', pos: 'noun', glossVi: 'con chó', glossEn: 'dog', audioUrl: 'x.ogg',
    }))
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ entry_id: 'en:dog', meaning_vi: 'con chó' }))
    expect(w.headword).toBe('dog')
  })
})

describe('listWords', () => {
  it('returns parsed rows', async () => {
    const { client } = mockInsert(row)
    const res = await listWords(client)
    expect(res[0].headword).toBe('dog')
  })
})
