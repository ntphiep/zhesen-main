import { describe, it, expect, vi, beforeEach } from 'vitest'

const { revalidateTag, adminUser, rpc } = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  adminUser: vi.fn(),
  rpc: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidateTag }))
vi.mock('@/lib/auth/admin', () => ({ adminUser }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ schema: () => ({ rpc }) }) }))

import { POST as accounts } from '@/app/api/admin/accounts/route'
import { POST as content } from '@/app/api/admin/content/route'

const ID_A = 'f5849087-73c3-4196-8aa0-491f7506c07b'
const ID_B = 'bcfc744d-d41b-443b-b0e3-5556ac0cb1fb'

const post = (handler: (r: Request) => Promise<Response>, body: unknown) =>
  handler(new Request('http://localhost/api/admin/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }))

beforeEach(() => {
  revalidateTag.mockClear()
  rpc.mockReset()
  adminUser.mockReset().mockResolvedValue({ id: ID_B })
})

describe('POST /api/admin/accounts', () => {
  it('answers 404 to a non-admin and never reaches the database', async () => {
    adminUser.mockResolvedValue(null)
    const res = await post(accounts, { action: 'merge', from: ID_A, into: ID_B })
    expect(res.status).toBe(404)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refuses a body that is not one of the two actions', async () => {
    expect((await post(accounts, { action: 'drop', id: ID_A })).status).toBe(400)
    expect((await post(accounts, { action: 'merge', from: 'not-a-uuid', into: ID_B })).status).toBe(400)
    expect((await post(accounts, 'null')).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  // A cross-site form can post text/plain with a JSON-looking body, but not application/json.
  it('refuses a body that is not sent as application/json', async () => {
    const res = await accounts(new Request('http://localhost/api/admin/accounts', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ action: 'delete', id: ID_A, confirm: ID_A }),
    }))
    expect(res.status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('passes the typed confirmation through to admin.delete_account', async () => {
    rpc.mockResolvedValue({ data: { deleted: ID_A, words: 410 }, error: null })
    const res = await post(accounts, { action: 'delete', id: ID_A, confirm: ID_A })
    expect(rpc).toHaveBeenCalledWith('delete_account', { p_user: ID_A, p_confirm: ID_A })
    await expect(res.json()).resolves.toEqual({ deleted: ID_A, words: 410 })
  })

  it('puts a database refusal into words', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'confirm_mismatch' } })
    const res = await post(accounts, { action: 'delete', id: ID_A, confirm: 'x' })
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ error: 'Chuỗi xác nhận không khớp.' })
  })

  it('answers 404 when the database gate disagrees with the server one', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'admin only' } })
    expect((await post(accounts, { action: 'merge', from: ID_A, into: ID_B })).status).toBe(404)
  })

  it('keeps Postgres text out of a fault', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } })
    const res = await post(accounts, { action: 'merge', from: ID_A, into: ID_B })
    expect(res.status).toBe(502)
    expect(JSON.stringify(await res.json())).not.toContain('statement')
  })
})

describe('POST /api/admin/content', () => {
  it('answers 404 to a non-admin', async () => {
    adminUser.mockResolvedValue(null)
    const res = await post(content, { action: 'flag', entryId: 'en:hello', reason: 'x' })
    expect(res.status).toBe(404)
    expect(rpc).not.toHaveBeenCalled()
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('writes a sense and then flushes the dictionary cache', async () => {
    rpc.mockResolvedValue({ data: {}, error: null })
    const res = await post(content, { action: 'update_sense', senseId: 'en:hello#1', glossVi: 'xin chào', glossEn: 'hello' })
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('update_sense', { p_sense: 'en:hello#1', p_gloss_vi: 'xin chào', p_gloss_en: 'hello' })
    expect(revalidateTag).toHaveBeenCalledWith('lex', { expire: 0 })
  })

  it('flags an entry without flushing, since no public page shows a flag', async () => {
    rpc.mockResolvedValue({ data: {}, error: null })
    await post(content, { action: 'flag', entryId: 'en:hello', reason: null })
    expect(rpc).toHaveBeenCalledWith('flag_entry', { p_entry: 'en:hello', p_reason: null })
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('flushes nothing when the write was refused', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'no_such_sense' } })
    const res = await post(content, { action: 'update_sense', senseId: 'x', glossVi: null, glossEn: null })
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ error: 'Không còn nghĩa này.' })
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})
