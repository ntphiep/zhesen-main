import { describe, it, expect, vi, beforeEach } from 'vitest'

const { lookUpText, createContentClient } = vi.hoisted(() => ({
  lookUpText: vi.fn(async () => ({ lang: 'en', words: [{ text: 'dog', entry: null }] })),
  createContentClient: vi.fn(() => ({})),
}))
vi.mock('@/lib/dictionary/textLookup', () => ({ lookUpText }))
vi.mock('@/lib/supabase/content', () => ({ createContentClient }))

import { POST } from '@/app/dictionary/text/lookup/route'

function post(body: unknown) {
  return POST(new Request('http://localhost/dictionary/text/lookup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }))
}

beforeEach(() => vi.clearAllMocks())

describe('POST /dictionary/text/lookup', () => {
  it('answers the word list for a passage', async () => {
    const res = await post({ text: 'The dog barks.' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ lang: 'en', words: [{ text: 'dog', entry: null }] })
    expect(lookUpText).toHaveBeenCalledWith(expect.anything(), 'The dog barks.')
  })

  // The same ceiling as the `translate` task, because both layers read one passage.
  it('refuses a passage over the cap without touching the database', async () => {
    const res = await post({ text: 'x'.repeat(1001) })
    expect(res.status).toBe(400)
    expect(lookUpText).not.toHaveBeenCalled()
  })

  it('refuses a blank passage', async () => {
    expect((await post({ text: '   ' })).status).toBe(400)
  })

  // `JSON.parse('null')` succeeds, so the try/catch around request.json() is not
  // enough on its own: the body still has to be parsed rather than cast.
  it('refuses a body that is not the promised shape', async () => {
    expect((await post('null')).status).toBe(400)
    expect((await post('{oops')).status).toBe(400)
    expect((await post({ text: 42 })).status).toBe(400)
    expect(lookUpText).not.toHaveBeenCalled()
  })
})
