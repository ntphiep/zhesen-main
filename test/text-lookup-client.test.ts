import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchTextLookup } from '@/lib/dictionary/textLookupClient'

function answer(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })))
}

afterEach(() => vi.unstubAllGlobals())

describe('fetchTextLookup refused', () => {
  it('shows the route\'s own message', async () => {
    answer(429, { error: 'Tra nhiều quá. Thử lại sau.' })
    expect(await fetchTextLookup('hola')).toEqual({ status: 'refused', message: 'Tra nhiều quá. Thử lại sau.' })
  })

  it('falls back when the error is not a string', async () => {
    answer(500, { error: 42 })
    expect(await fetchTextLookup('hola')).toEqual({ status: 'refused', message: 'Chưa tra được đoạn này. Thử lại.' })
  })
})
