import { describe, it, expect, vi } from 'vitest'
import { parseUserWordRow, draftFromDictEntry, addWord, addWords, updateWordsStatus, listWords, listPracticeWords, listSavedEntryIds, WordAlreadyExistsError, PRACTICE_POOL } from '@/lib/wordlist/store'
import { authStub } from './helpers/supabase'
import type { DictEntryDetail, DictEntryPreview } from '@/lib/dictionary/types'
import type { WordDraft } from '@/lib/wordlist/types'
import { resetSessionState } from '@/lib/supabase/session'

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
// check (select.eq.limit), and the paginated reads, which end in .range(). Reads
// answer the first page in full and every later page empty, so fetchAllRows stops
// after one round trip.
function mockClient({ existing = [] as unknown[], inserted = row, session = { user: { id: 'u1' } } as unknown } = {}) {
  const insertSingle = vi.fn(() => Promise.resolve({ data: inserted, error: null }))
  const insertSelect = vi.fn(() => ({ single: insertSingle }))
  const insert = vi.fn(() => ({ select: insertSelect }))
  const limit = vi.fn(() => Promise.resolve({ data: existing, error: null }))
  const pageOf = (rows: unknown[]) =>
    vi.fn((from: number) => Promise.resolve({ data: from === 0 ? rows : [], error: null }))
  const listRange = pageOf([inserted])
  const savedRange = pageOf(existing)
  const order = vi.fn(() => ({ range: listRange }))
  const notNull = vi.fn(() => ({ range: savedRange }))
  const eq = vi.fn(() => ({ limit, not: notNull }))
  const select = vi.fn(() => ({ eq, order, limit, range: listRange, not: notNull }))
  const from = vi.fn(() => ({ insert, select }))
  // A real client always carries `auth`; the write paths use it to create the
  // anonymous account on the first saved word (lib/supabase/session.ts).
  const signInAnonymously = vi.fn(async () => ({ error: null }))
  const { auth } = authStub(session, signInAnonymously)
  return {
    client: { from, auth } as unknown as import('@supabase/supabase-js').SupabaseClient,
    insert, select, signInAnonymously,
  }
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

  it('creates the anonymous account on the first saved word', async () => {
    // Browsing the dictionary deliberately creates no account, so the first write
    // is where one has to appear or the insert fails against RLS.
    resetSessionState()
    const { client, insert, signInAnonymously } = mockClient({ session: null })
    await addWord(client, draftFromDictEntry(dogEntry))
    expect(signInAnonymously).toHaveBeenCalledTimes(1)
    expect(insert).toHaveBeenCalled()
  })

  it('reuses the account a returning user already has', async () => {
    resetSessionState()
    const { client, signInAnonymously } = mockClient()
    await addWord(client, draftFromDictEntry(dogEntry))
    expect(signInAnonymously).not.toHaveBeenCalled()
  })

  it('throws WordAlreadyExistsError and does not insert when the entry is already saved', async () => {
    const { client, insert } = mockClient({ existing: [{ id: 'existing-id' }] })
    await expect(addWord(client, draftFromDictEntry(dogEntry))).rejects.toBeInstanceOf(WordAlreadyExistsError)
    expect(insert).not.toHaveBeenCalled()
  })

  // The read above cannot see a request that is still in flight, so two overlapping
  // adds both pass it and the unique index (migration 0031) is what rejects the
  // second. The caller has to get the same error either way.
  it('reports a duplicate when the unique index rejects the insert', async () => {
    const insertSingle = vi.fn(() => Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } }))
    const insert = vi.fn(() => ({ select: () => ({ single: insertSingle }) }))
    const limit = vi.fn(() => Promise.resolve({ data: [], error: null }))
    const select = vi.fn(() => ({ eq: () => ({ limit }) }))
    const { auth } = authStub({ user: { id: 'u1' } })
    const client = { from: vi.fn(() => ({ insert, select })), auth } as unknown as import('@supabase/supabase-js').SupabaseClient
    resetSessionState()
    await expect(addWord(client, draftFromDictEntry(dogEntry))).rejects.toBeInstanceOf(WordAlreadyExistsError)
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

describe('listSavedEntryIds', () => {
  it('returns the saved entry ids for a language as a Set, filtering out nulls in the query', async () => {
    // The read pages through .range(); answer the first page and nothing after it.
    const range = vi.fn((from: number) =>
      Promise.resolve({ data: from === 0 ? [{ entry_id: 'en:dog' }, { entry_id: 'en:cat' }] : [], error: null }))
    const not = vi.fn(() => ({ range }))
    const eq = vi.fn(() => ({ not }))
    const select = vi.fn(() => ({ eq }))
    const client = { from: vi.fn(() => ({ select })) } as unknown as import('@supabase/supabase-js').SupabaseClient
    const ids = await listSavedEntryIds(client, 'en')
    expect(eq).toHaveBeenCalledWith('lang', 'en')
    expect(not).toHaveBeenCalledWith('entry_id', 'is', null)
    expect(ids).toEqual(new Set(['en:dog', 'en:cat']))
  })
})

describe('addWords', () => {
  it('bulk-inserts drafts (e.g. CSV import) with no duplicate check', async () => {
    const insertSelect = vi.fn(() => Promise.resolve({ data: [row], error: null }))
    const insert = vi.fn(() => ({ select: insertSelect }))
    const signInAnonymously = vi.fn(async () => ({ error: null }))
    const { auth } = authStub(null, signInAnonymously)
    const client = { from: vi.fn(() => ({ insert })), auth } as unknown as import('@supabase/supabase-js').SupabaseClient
    const draft = draftFromDictEntry(dogEntry)
    resetSessionState()
    const res = await addWords(client, [draft, draft, draft])
    expect(insert).toHaveBeenCalledWith([
      expect.objectContaining({ headword: 'dog' }),
      expect.objectContaining({ headword: 'dog' }),
      expect.objectContaining({ headword: 'dog' }),
    ])
    // One account for the whole import, not one per row.
    expect(signInAnonymously).toHaveBeenCalledTimes(1)
    expect(res[0].headword).toBe('dog')
  })

  /**
   * A client whose bulk insert fails with `code`, and whose per-row retries are
   * answered by `perRow` in order. Mirrors the two shapes the store uses:
   * `insert(rows).select()` for a chunk, `insert(row).select().single()` for one.
   */
  function chunkFailsClient(code: string, perRow: Array<{ data: unknown; error: unknown }>) {
    const rowsSeen: unknown[] = []
    const insert = vi.fn((payload: unknown) => {
      rowsSeen.push(payload)
      if (Array.isArray(payload)) {
        return { select: () => Promise.resolve({ data: null, error: { code, message: code } }) }
      }
      return { select: () => ({ single: () => Promise.resolve(perRow.shift()!) }) }
    })
    const { auth } = authStub({ user: { id: 'u1' } })
    return {
      client: { from: vi.fn(() => ({ insert })), auth } as unknown as import('@supabase/supabase-js').SupabaseClient,
      rowsSeen,
    }
  }

  // Restoring a backup written before the dictionary changed carries entry ids
  // that no longer exist. The first shape of this retried the WHOLE import with
  // every entry_id stripped, so one stale link cost every other word its
  // dictionary link. Only the offending row loses its link now.
  it('drops the stale dictionary link on that row alone', async () => {
    const cat = { ...dogEntry, id: 'en:cat', headword: 'cat' }
    const { client, rowsSeen } = chunkFailsClient('23503', [
      { data: null, error: { code: '23503', message: 'violates foreign key constraint' } },
      { data: { ...row, entry_id: null }, error: null },
      { data: { ...row, id: '2', entry_id: 'en:cat', headword: 'cat' }, error: null },
    ])
    resetSessionState()
    const res = await addWords(client, [draftFromDictEntry(dogEntry), draftFromDictEntry(cat)])

    const single = rowsSeen.filter((r) => !Array.isArray(r)) as Record<string, unknown>[]
    expect(single[0]).toMatchObject({ entry_id: 'en:dog' })     // tried with its link
    expect(single[1]).toMatchObject({ entry_id: null })          // retried without
    expect(single[2]).toMatchObject({ entry_id: 'en:cat' })      // the other keeps its link
    expect(res).toHaveLength(2)
  })

  // The unique index from migration 0031 makes a duplicate an error, so a CSV
  // holding one word already saved used to fail the entire import.
  it('skips a word already saved instead of failing the import', async () => {
    const cat = { ...dogEntry, id: 'en:cat', headword: 'cat' }
    const { client } = chunkFailsClient('23505', [
      { data: null, error: { code: '23505', message: 'duplicate key value' } },
      { data: { ...row, id: '2', entry_id: 'en:cat', headword: 'cat' }, error: null },
    ])
    resetSessionState()
    const res = await addWords(client, [draftFromDictEntry(dogEntry), draftFromDictEntry(cat)])
    expect(res.map((w) => w.headword)).toEqual(['cat'])
  })

  // Anything that is not a constraint the import knows how to recover from is a
  // real failure and must not be quietly swallowed row by row.
  it('raises an error it has no recovery for', async () => {
    const insert = vi.fn(() => ({
      select: () => Promise.resolve({ data: null, error: { code: '42501', message: 'permission denied' } }),
    }))
    const { auth } = authStub({ user: { id: 'u1' } })
    const client = { from: vi.fn(() => ({ insert })), auth } as unknown as import('@supabase/supabase-js').SupabaseClient
    resetSessionState()
    await expect(addWords(client, [draftFromDictEntry(dogEntry)])).rejects.toMatchObject({ code: '42501' })
  })

  // PostgREST caps a response at 1000 rows however many were inserted, so a
  // single insert of more than that reported back a thousand and the list on
  // screen was short by the difference until a reload.
  it('inserts more than a thousand words in chunks and returns all of them', async () => {
    let n = 0
    const insert = vi.fn((payload: unknown[]) => ({
      select: () => {
        const batch = payload.map(() => ({ ...row, id: `id${n++}` }))
        return Promise.resolve({ data: batch, error: null })
      },
    }))
    const { auth } = authStub({ user: { id: 'u1' } })
    const client = { from: vi.fn(() => ({ insert })), auth } as unknown as import('@supabase/supabase-js').SupabaseClient
    resetSessionState()
    const drafts = Array.from({ length: 1200 }, () => draftFromDictEntry(dogEntry))
    const res = await addWords(client, drafts)
    expect(res).toHaveLength(1200)
    expect(insert.mock.calls.every((c) => (c[0] as unknown[]).length <= 500)).toBe(true)
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

describe('draftFromDictEntry with the full entry', () => {
  const detail = (over: Partial<DictEntryDetail> = {}): DictEntryDetail => ({
    ...dogEntry,
    senses: [], pronunciations: [], relations: [],
    examples: [{ text: 'The dog barked.', reading: null, translationVi: 'Con chó sủa.', translationEn: null }],
    attributes: {},
    ...over,
  })

  it('puts an example sentence on the card', () => {
    // WordReviewCard has rendered card.example all along; the draft hardcoded null,
    // so every card added from the lookup page was a bare word with no context.
    const d = draftFromDictEntry(detail())
    expect(d.example).toBe('The dog barked.')
    expect(d.exampleTranslation).toBe('Con chó sủa.')
  })

  it('skips an example with no Vietnamese translation', () => {
    const d = draftFromDictEntry(detail({
      examples: [{ text: 'The dog barked.', reading: null, translationVi: null, translationEn: 'x' }],
    }))
    expect(d.example).toBeNull()
  })

  it('skips the run-together strings the dump carries', () => {
    const d = draftFromDictEntry(detail({
      examples: [{ text: 'Thequickbrownfoxjumps', reading: null, translationVi: 'x', translationEn: null }],
    }))
    expect(d.example).toBeNull()
  })

  it('prefers the shortest usable sentence, since a card has room for one line', () => {
    const d = draftFromDictEntry(detail({
      examples: [
        { text: 'A very long sentence about a dog and many other things.', reading: null, translationVi: 'a', translationEn: null },
        { text: 'The dog ran.', reading: null, translationVi: 'b', translationEn: null },
      ],
    }))
    expect(d.example).toBe('The dog ran.')
  })

  it('takes the reading from the whole-word pinyin', () => {
    const d = draftFromDictEntry(detail({ attributes: { pinyin: 'gǒu' } }))
    expect(d.reading).toBe('gǒu')
  })

  it('does not repeat the pinyin the entry already shows as its pronunciation', () => {
    // For Chinese the pipeline puts pinyin in the ipa column, so filling both
    // printed "xué xí" twice on the review card.
    const d = draftFromDictEntry(detail({ ipa: 'xué xí', attributes: { pinyin: 'xué xí' } }))
    expect(d.reading).toBeNull()
    expect(d.ipa).toBe('xué xí')
  })

  it('keeps the reading when it differs from the pronunciation shown', () => {
    const d = draftFromDictEntry(detail({ ipa: '/ɕɥě ɕǐ/', attributes: { pinyin: 'xué xí' } }))
    expect(d.reading).toBe('xué xí')
  })

  it('leaves the reading empty when there is no pinyin', () => {
    expect(draftFromDictEntry(detail({ attributes: { pinyin: '  ' } })).reading).toBeNull()
    expect(draftFromDictEntry(detail({ attributes: {} })).reading).toBeNull()
  })

  it('still works from a preview, which has neither to offer', () => {
    const d = draftFromDictEntry(dogEntry)
    expect(d).toMatchObject({ headword: 'dog', example: null, exampleTranslation: null, reading: null })
  })
})

describe('listPracticeWords', () => {
  /** Records the projection and the range asked for; answers with `rows`. */
  function mockClient(total: number, rows: unknown[]) {
    const seen: { columns?: string; from?: number; to?: number } = {}
    const from = vi.fn(() => {
      const chain = {
        select: (columns: string, opts?: { head?: boolean }) => {
          if (opts?.head) return Promise.resolve({ count: total, error: null })
          seen.columns = columns
          return chain
        },
        order: () => chain,
        range: (a: number, b: number) => {
          seen.from = a; seen.to = b
          return Promise.resolve({ data: rows, error: null })
        },
      }
      return chain
    })
    return { client: { from } as unknown as import('@supabase/supabase-js').SupabaseClient, seen }
  }

  const practiceRow = {
    id: 'w1', lang: 'en', headword: 'dog', ipa: '/dɔːɡ/', meaning_vi: 'con chó', audio_url: null,
  }

  // A 407-word account pulled 407 full rows of a 26-column table to build a
  // six-tile round, and paid it again on every change of mode.
  it('asks for six columns and one pool, not the whole wordlist', async () => {
    const { client, seen } = mockClient(407, [practiceRow])
    const res = await listPracticeWords(client, PRACTICE_POOL, () => 0)
    expect(seen.columns).toBe('id, lang, headword, ipa, meaning_vi, audio_url')
    expect((seen.to ?? 0) - (seen.from ?? 0) + 1).toBe(PRACTICE_POOL)
    expect(res[0]).toEqual({ id: 'w1', lang: 'en', headword: 'dog', ipa: '/dɔːɡ/', meaningVi: 'con chó', audioUrl: null })
  })

  // Otherwise the same sixty words come up every session.
  it('starts the window somewhere different each round', async () => {
    const { client, seen } = mockClient(407, [practiceRow])
    await listPracticeWords(client, PRACTICE_POOL, () => 0.5)
    expect(seen.from).toBe(Math.floor(0.5 * (407 - PRACTICE_POOL + 1)))
  })

  it('never leaves the end of a wordlist smaller than the pool', async () => {
    const { client, seen } = mockClient(12, [practiceRow])
    await listPracticeWords(client, PRACTICE_POOL, () => 0.99)
    expect(seen.from).toBe(0)
  })

  it('asks for nothing when the wordlist is empty', async () => {
    const { client, seen } = mockClient(0, [])
    expect(await listPracticeWords(client)).toEqual([])
    expect(seen.columns).toBeUndefined()
  })
})
