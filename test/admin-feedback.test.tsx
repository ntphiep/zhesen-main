import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { refresh, revalidateTag, adminUser, rpc } = vi.hoisted(() => ({
  refresh: vi.fn(),
  revalidateTag: vi.fn(),
  adminUser: vi.fn(),
  rpc: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('next/cache', () => ({ revalidateTag }))
vi.mock('@/lib/auth/admin', () => ({ adminUser }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ schema: () => ({ rpc }) }) }))

import { FeedbackActions } from '@/components/admin/FeedbackActions'
import { canApply, parseFeedback } from '@/lib/admin/feedback'
import { POST as content } from '@/app/api/admin/content/route'

/** One row of `admin.feedback_open()`, the report the owner filed on en:takeoff. */
const ROW = {
  id: 7, entry_id: 'en:takeoff', headword: 'takeoff', lang: 'en', sense_id: 'en:takeoff#1', sense_order: 1,
  gloss_vi: 'cởi', gloss_en: 'The rising of an aircraft into flight.', kind: 'meaning',
  message: 'cởi là take off', suggestion: 'sự cất cánh', created_at: '2026-09-29T03:12:00+00:00',
}

const fetchMock = vi.fn()

beforeEach(() => {
  refresh.mockClear()
  revalidateTag.mockClear()
  rpc.mockReset()
  adminUser.mockReset().mockResolvedValue({ id: 'bcfc744d-d41b-443b-b0e3-5556ac0cb1fb' })
  fetchMock.mockReset().mockResolvedValue(new Response('{"ok":true}', { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('parseFeedback and canApply', () => {
  it('reads a row into camelCase', () => {
    expect(parseFeedback([ROW])[0]).toEqual({
      id: 7, entryId: 'en:takeoff', headword: 'takeoff', lang: 'en', senseId: 'en:takeoff#1', senseOrder: 1,
      glossVi: 'cởi', glossEn: 'The rising of an aircraft into flight.', kind: 'meaning',
      message: 'cởi là take off', suggestion: 'sự cất cánh', createdAt: '2026-09-29T03:12:00+00:00',
    })
  })

  it('keeps a report whose entry and sense a reload removed', () => {
    const f = parseFeedback([{ ...ROW, headword: null, lang: null, sense_order: null, gloss_vi: null, gloss_en: null }])[0]
    expect(f).toMatchObject({ entryId: 'en:takeoff', headword: null, lang: null, senseId: 'en:takeoff#1', senseOrder: null })
    expect(canApply(f)).toBe(false)
  })

  it('refuses a row of another shape', () => {
    expect(() => parseFeedback([{ ...ROW, kind: 'spelling' }])).toThrow()
  })

  it('applies only a meaning report on one sense with a suggestion', () => {
    const f = parseFeedback([ROW])[0]
    expect(canApply(f)).toBe(true)
    expect(canApply({ ...f, kind: 'example' })).toBe(false)
    expect(canApply({ ...f, senseId: null })).toBe(false)
    expect(canApply({ ...f, suggestion: null })).toBe(false)
    expect(canApply({ ...f, suggestion: '  ' })).toBe(false)
  })
})

describe('FeedbackActions', () => {
  it('applies a report and re-reads the page', async () => {
    render(<FeedbackActions id={7} canApply />)
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/content', expect.objectContaining({ method: 'POST' }))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ action: 'resolve_feedback', id: 7, status: 'applied' })
    expect(refresh).toHaveBeenCalled()
  })

  it('offers only Dismiss when there is nothing to apply', async () => {
    render(<FeedbackActions id={8} canApply={false} />)
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ action: 'resolve_feedback', id: 8, status: 'dismissed' })
  })

  it('shows a refusal and does not re-read', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'This report is already closed.' }), { status: 409 }))
    render(<FeedbackActions id={7} canApply />)
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(await screen.findByText('This report is already closed.')).toBeInTheDocument()
    expect(refresh).not.toHaveBeenCalled()
  })
})

const post = (body: unknown) =>
  content(new Request('http://localhost/api/admin/content', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }))

describe('POST /api/admin/content resolve_feedback', () => {
  it('answers 404 to a non-admin and never reaches the database', async () => {
    adminUser.mockResolvedValue(null)
    expect((await post({ action: 'resolve_feedback', id: 7, status: 'applied' })).status).toBe(404)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refuses a status other than applied or dismissed', async () => {
    expect((await post({ action: 'resolve_feedback', id: 7, status: 'open' })).status).toBe(400)
    expect((await post({ action: 'resolve_feedback', id: 0, status: 'dismissed' })).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('applies through admin.resolve_feedback and flushes the dictionary cache', async () => {
    rpc.mockResolvedValue({ data: { id: 7, status: 'applied' }, error: null })
    const res = await post({ action: 'resolve_feedback', id: 7, status: 'applied' })
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('resolve_feedback', { p_id: 7, p_status: 'applied' })
    expect(revalidateTag).toHaveBeenCalledWith('lex', { expire: 0 })
  })

  it('dismisses without flushing, since no public page changes', async () => {
    rpc.mockResolvedValue({ data: { id: 7, status: 'dismissed' }, error: null })
    await post({ action: 'resolve_feedback', id: 7, status: 'dismissed' })
    expect(rpc).toHaveBeenCalledWith('resolve_feedback', { p_id: 7, p_status: 'dismissed' })
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('puts a refusal into words and flushes nothing', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'nothing_to_apply' } })
    const res = await post({ action: 'resolve_feedback', id: 7, status: 'applied' })
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ error: 'Only a wrong-meaning report on one sense, with a suggestion, can be applied.' })
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})
