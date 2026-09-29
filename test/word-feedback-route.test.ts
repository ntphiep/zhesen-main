import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }))

import { POST } from '@/app/dictionary/feedback/route'

const REPORT = {
  entryId: 'en:takeoff', senseId: 'en:takeoff#1', kind: 'meaning', message: '"cởi" là take off, không phải takeoff', suggestion: 'sự cất cánh',
}

function post(body: unknown, ip?: string) {
  return POST(new Request('http://localhost/dictionary/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(ip ? { 'x-forwarded-for': ip } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }))
}

const savedVercel = process.env.VERCEL

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: 1, error: null })
  delete process.env.VERCEL
})
afterEach(() => {
  if (savedVercel === undefined) delete process.env.VERCEL
  else process.env.VERCEL = savedVercel
})

describe('POST /dictionary/feedback', () => {
  it('files a report through the RPC with the caller session', async () => {
    const res = await post(REPORT)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('submit_word_feedback', {
      p_entry_id: 'en:takeoff', p_sense_id: 'en:takeoff#1', p_kind: 'meaning',
      p_message: '"cởi" là take off, không phải takeoff', p_proposed: 'sự cất cánh', p_ip_hash: null,
    })
  })

  it('files a whole-word report without a suggestion', async () => {
    await post({ ...REPORT, senseId: null, suggestion: null })
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_sense_id: null, p_proposed: null })
  })

  it('sends a blank suggestion as none', async () => {
    await post({ ...REPORT, suggestion: '   ' })
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_proposed: null })
  })

  it('refuses a blank, overlong or malformed report without calling the database', async () => {
    expect((await post({ ...REPORT, message: '   ' })).status).toBe(400)
    expect((await post({ ...REPORT, message: 'x'.repeat(501) })).status).toBe(400)
    expect((await post({ ...REPORT, suggestion: 'x'.repeat(81) })).status).toBe(400)
    expect((await post({ ...REPORT, kind: 'spelling' })).status).toBe(400)
    expect((await post({ ...REPORT, entryId: '' })).status).toBe(400)
    expect((await post('{oops')).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('accepts a message at the 500-character limit', async () => {
    expect((await post({ ...REPORT, message: 'x'.repeat(500) })).status).toBe(200)
  })

  it('answers 429 when the database cap refuses', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'rate_limited' } })
    const res = await post(REPORT)
    expect(res.status).toBe(429)
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0)
  })

  it('answers 400 for a word or sense that does not exist', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'no_such_entry' } })
    expect((await post({ ...REPORT, entryId: 'en:nosuchword' })).status).toBe(400)
    rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'no_such_sense' } })
    expect((await post({ ...REPORT, senseId: 'en:hello#1' })).status).toBe(400)
  })

  it('keeps Postgres text out of a fault', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } })
    const res = await post(REPORT)
    expect(res.status).toBe(502)
    expect(JSON.stringify(await res.json())).not.toContain('statement')
  })

  it('allows ten reports an hour per client, then answers 429 with Retry-After', async () => {
    process.env.VERCEL = '1'
    for (let i = 0; i < 10; i++) expect((await post(REPORT, '203.0.113.7')).status).toBe(200)
    const res = await post(REPORT, '203.0.113.7')
    expect(res.status).toBe(429)
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0)
    expect(rpc).toHaveBeenCalledTimes(10)
    // Another client keeps its own budget.
    expect((await post(REPORT, '198.51.100.4')).status).toBe(200)
  })

  it('sends a hash of the client, not its address', async () => {
    process.env.VERCEL = '1'
    await post(REPORT, '192.0.2.55')
    const hash = rpc.mock.calls[0][1].p_ip_hash
    expect(hash).toMatch(/^[0-9a-f]{32}$/)
    expect(hash).not.toContain('192.0.2.55')
  })
})
