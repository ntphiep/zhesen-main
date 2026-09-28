import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CASA_AUDIT_ROW, CASA_SENSE_ROWS, LAYER_LIST_ROWS } from './helpers/learner'

const { revalidateTag, adminUser, rpc, refresh } = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  adminUser: vi.fn(),
  rpc: vi.fn(),
  refresh: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidateTag }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('@/lib/auth/admin', () => ({ adminUser }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ schema: () => ({ rpc }) }) }))

import { POST } from '@/app/api/admin/learner/route'
import { LearnerStatusButton } from '@/components/admin/LearnerStatusButton'
import { auditHref, parseAudit, parseLayerList } from '@/lib/admin/learner'

const post = (body: unknown) => POST(new Request('http://localhost/api/admin/learner', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
}))

describe('parseLayerList', () => {
  it('reads the counts PostgREST embeds for each layer', () => {
    expect(parseLayerList(LAYER_LIST_ROWS)).toEqual([
      expect.objectContaining({ entryId: 'es:casa', headword: 'casa', lang: 'es', status: 'published', senses: 1, links: 15, labels: 4, issues: 0, rejected: 0 }),
      expect.objectContaining({ entryId: 'zh:学习', headword: '学习', senses: 1, links: 16, labels: 2, promptVersion: 'pilot-v1' }),
    ])
  })

  it('links a layer to its audit page', () => {
    expect(auditHref('zh:学习')).toBe('/admin/learner/zh/%E5%AD%A6%E4%B9%A0')
  })
})

describe('parseAudit', () => {
  const audit = parseAudit(CASA_AUDIT_ROW, CASA_SENSE_ROWS)

  it('puts every raw sense of es:casa beside its label', () => {
    expect(audit.senses.map((s) => s.id)).toEqual(['es:casa#1', 'es:casa#2', 'es:casa#3', 'es:casa#4'])
    expect(audit.senses[0].label).toMatchObject({ coreSenseOrder: 1, coreTerms: 'nhà, căn nhà, ngôi nhà', fixedAt: null })
    expect(audit.senses[1]).toMatchObject({
      glossEn: 'inflection of casar:',
      glossVi: "Dạng chia của động từ 'casar' (cưới, kết hôn)",
      label: { isInflection: true, lemma: 'casar', previousGlossVi: 'cưới, kết hôn', coreSenseOrder: null },
    })
  })

  it('reads a review the model wrote in any shape it allows', () => {
    const review = { issues: [{ path: 'core_senses[0]', problem: 'x', severity: 'high' }], rejected: [{ reason: 'wrong' }] }
    const parsed = parseAudit({ ...CASA_AUDIT_ROW, review }, CASA_SENSE_ROWS)
    expect(parsed.issues).toEqual([{ path: 'core_senses[0]', problem: 'x', fix: null, severity: 'high' }])
    expect(parsed.rejected).toEqual([{ path: null, reason: 'wrong' }])
    expect(parseAudit({ ...CASA_AUDIT_ROW, review: {} }, []).issues).toEqual([])
  })

  it('turns lists and objects in a review into text and skips items that are not objects', () => {
    const review = {
      issues: [{ path: ['core_senses', 0], problem: { what: 'x' }, severity: 2 }, 'loose note', null],
      rejected: [['a'], { reason: ['too', 'long'] }],
    }
    const parsed = parseAudit({ ...CASA_AUDIT_ROW, review }, CASA_SENSE_ROWS)
    expect(parsed.issues).toEqual([{ path: '["core_senses",0]', problem: '{"what":"x"}', fix: null, severity: '2' }])
    expect(parsed.rejected).toEqual([{ path: null, reason: '["too","long"]' }])
    expect(parseAudit({ ...CASA_AUDIT_ROW, review: null }, []).rejected).toEqual([])
  })
})

describe('POST /api/admin/learner', () => {
  beforeEach(() => {
    revalidateTag.mockClear()
    rpc.mockReset()
    adminUser.mockReset().mockResolvedValue({ id: 'admin' })
  })

  it('answers 404 to a non-admin and never reaches the database', async () => {
    adminUser.mockResolvedValue(null)
    expect((await post({ entryId: 'es:casa', status: 'hidden' })).status).toBe(404)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refuses a status that does not exist', async () => {
    expect((await post({ entryId: 'es:casa', status: 'deleted' })).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('hides a layer and flushes the dictionary cache', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    const res = await post({ entryId: 'es:casa', status: 'hidden' })
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('learner_set_status', { p_entry_id: 'es:casa', p_status: 'hidden' })
    expect(revalidateTag).toHaveBeenCalledWith('lex', { expire: 0 })
  })

  it('puts a refusal into words and flushes nothing', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'unknown_entry' } })
    const res = await post({ entryId: 'en:dog', status: 'hidden' })
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ error: 'This entry has no learner layer.' })
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})

describe('LearnerStatusButton', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    refresh.mockClear()
    fetchMock.mockReset().mockResolvedValue(new Response('{"ok":true}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('hides a published layer and re-reads the page', async () => {
    render(<LearnerStatusButton entryId="es:casa" status="published" />)
    await userEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ entryId: 'es:casa', status: 'hidden' })
    expect(refresh).toHaveBeenCalled()
  })

  it('offers to publish a hidden layer', () => {
    render(<LearnerStatusButton entryId="es:casa" status="hidden" />)
    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument()
  })
})
