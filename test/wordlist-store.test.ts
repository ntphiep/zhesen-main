import { describe, it, expect, vi } from 'vitest'
import { parseUserWordRow, draftFromDictEntry, addWord, addWords, updateWordsStatus, listWords, WordAlreadyExistsError } from '@/lib/wordlist/store'
import type { DictEntryPreview } from '@/lib/dictionary/types'
import type { WordDraft } from '@/lib/wordlist/types'

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

// Builder mock supporting insert (insert.select.single), the pre-insert duplicate
// check (select.eq.limit) and listWords (select.order).
function mockClient({ existing = [] as unknown[], inserted = row } = {}) {
  const insertSingle = vi.fn(() => Promise.resolve({ data: inserted, error: null }))
  const insertSelect = vi.fn(() => ({ single: insertSingle }))
  const insert = vi.fn(() => ({ select: insertSelect }))
  const limit = vi.fn(() => Promise.resolve({ data: existing, error: null }))
  const eq = vi.fn(() => ({ limit }))
  const order = vi.fn(() => Promise.resolve({ data: [inserted], error: null }))
  const select = vi.fn(() => ({ eq, order, limit }))
  const from = vi.fn(() => ({ insert, select }))
  return { client: { from } as unknown as import('@supabase/supabase-js').SupabaseClient, insert, select }
}

const dogEntry: DictEntryPreview = {
  id: 'en:dog', lang: 'en', headword: 'dog', traditional: null, level: 'A1',
  ipa: '/dɔːɡ/', pos: 'noun', glossVi: 'con chó', glossEn: 'dog', audioUrl: 'x.ogg',
}

describe('addWord', () => {
  it('inserts a draft and returns the parsed word when not a duplicate', async () => {
    const { client, insert } = mockClient({ existing: [] })
    const w = await addWord(client, draftFromDictEntry(dogEntry))
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ entry_id: 'en:dog', meaning_vi: 'con chó' }))
    expect(insert).toHaveBeenCalledWith(expect.not.objectContaining({ user_id: expect.anything() }))
    expect(w.headword).toBe('dog')
  })

  it('throws WordAlreadyExistsError and does not insert when the entry is already saved', async () => {
    const { client, insert } = mockClient({ existing: [{ id: 'existing-id' }] })
    await expect(addWord(client, draftFromDictEntry(dogEntry))).rejects.toBeInstanceOf(WordAlreadyExistsError)
    expect(insert).not.toHaveBeenCalled()
  })

  it('skips the duplicate check for custom words without an entryId', async () => {
    const { client, insert, select } = mockClient({ existing: [{ id: 'x' }] })
    await addWord(client, { ...draftFromDictEntry(dogEntry), entryId: null })
    expect(insert).toHaveBeenCalled()
    expect(select).not.toHaveBeenCalled()
  })
})

describe('listWords', () => {
  it('returns parsed rows', async () => {
    const { client } = mockClient()
    const res = await listWords(client)
    expect(res[0].headword).toBe('dog')
  })
})

describe('addWords', () => {
  it('bulk-inserts drafts (e.g. CSV import) with no duplicate check', async () => {
    const insertSelect = vi.fn(() => Promise.resolve({ data: [row], error: null }))
    const insert = vi.fn(() => ({ select: insertSelect }))
    const client = { from: vi.fn(() => ({ insert })) } as unknown as import('@supabase/supabase-js').SupabaseClient
    const draft = draftFromDictEntry(dogEntry)
    const res = await addWords(client, [draft])
    expect(insert).toHaveBeenCalledWith([expect.objectContaining({ headword: 'dog' })])
    expect(res[0].headword).toBe('dog')
  })

  it('is a no-op for an empty draft list', async () => {
    const insert = vi.fn()
    const client = { from: vi.fn(() => ({ insert })) } as unknown as import('@supabase/supabase-js').SupabaseClient
    expect(await addWords(client, [] as WordDraft[])).toEqual([])
    expect(insert).not.toHaveBeenCalled()
  })
})

describe('updateWordsStatus', () => {
  it('updates status for every given id in one query', async () => {
    const inClause = vi.fn(() => Promise.resolve({ error: null }))
    const update = vi.fn(() => ({ in: inClause }))
    const client = { from: vi.fn(() => ({ update })) } as unknown as import('@supabase/supabase-js').SupabaseClient
    await updateWordsStatus(client, ['a', 'b'], 'known')
    expect(update).toHaveBeenCalledWith({ status: 'known' })
    expect(inClause).toHaveBeenCalledWith('id', ['a', 'b'])
  })

  it('is a no-op for an empty id list', async () => {
    const update = vi.fn()
    const client = { from: vi.fn(() => ({ update })) } as unknown as import('@supabase/supabase-js').SupabaseClient
    await updateWordsStatus(client, [], 'known')
    expect(update).not.toHaveBeenCalled()
  })
})
