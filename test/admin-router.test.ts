import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readCombos } from '@/lib/admin/router'

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('readCombos', () => {
  it('signs in with the dashboard password and reads the combos with its cookie', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('{"success":true}', { headers: { 'set-cookie': 'auth_token=jwt123; Path=/; HttpOnly' } }))
      .mockResolvedValueOnce(Response.json({ combos: [{ id: 'c1', name: 'zhesen', models: ['ag/gemini-3.8-flash', 'kr/glm-5'] }] }))
    const combos = await readCombos('https://d1router.cloudfront.net/', 'pw')
    expect(combos).toEqual([{ name: 'zhesen', models: ['ag/gemini-3.8-flash', 'kr/glm-5'] }])
    expect(fetchMock.mock.calls[0][0]).toBe('https://d1router.cloudfront.net/api/auth/login')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ password: 'pw' })
    expect(fetchMock.mock.calls[1][1].headers).toEqual({ cookie: 'auth_token=jwt123' })
  })

  it('says so when the password is refused', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: 'Invalid password' }, { status: 401 }))
    await expect(readCombos('https://d1router.cloudfront.net', 'wrong')).rejects.toThrow('9router login answered 401')
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
