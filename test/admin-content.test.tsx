import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

import { EntryEditor } from '@/components/admin/EntryEditor'
import { parseEntry } from '@/lib/admin/content'

/** `admin.entry('en:hello')` on production, trimmed to two senses. */
const ENTRY = parseEntry({
  id: 'en:hello',
  lang: 'en',
  headword: 'hello',
  flag: null,
  senses: [
    { id: 'en:hello#1', pos: 'intj', sense_order: 1, gloss_vi: 'xin chào; biểu lộ sự ngạc nhiên',
      gloss_vi_is_mt: false, gloss_en: 'A greeting said when meeting someone.' },
    { id: 'en:hello#2', pos: 'noun', sense_order: 2, gloss_vi: 'lời chào',
      gloss_vi_is_mt: true, gloss_en: '"Hello!" or an equivalent greeting.' },
  ],
})!

const fetchMock = vi.fn()

beforeEach(() => {
  refresh.mockClear()
  fetchMock.mockReset().mockResolvedValue(new Response('{"ok":true}', { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

const viBoxes = () => screen.getAllByRole('textbox', { name: 'Nghĩa tiếng Việt' })

describe('EntryEditor', () => {
  it('links to the entry page the edit will change', () => {
    render(<EntryEditor entry={ENTRY} />)
    expect(screen.getByRole('link', { name: 'Xem trang từ điển' })).toHaveAttribute('href', '/dictionary/en/hello')
  })

  it('warns while a Vietnamese gloss is over 80 characters, before anything is saved', async () => {
    render(<EntryEditor entry={ENTRY} />)
    await userEvent.clear(viBoxes()[0])
    await userEvent.type(viBoxes()[0], 'a'.repeat(81))
    expect(screen.getByText(/81 ký tự, quá 80/)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('saves the edited glosses of one sense and re-reads the page', async () => {
    render(<EntryEditor entry={ENTRY} />)
    await userEvent.clear(viBoxes()[0])
    await userEvent.type(viBoxes()[0], 'xin chào')
    await userEvent.click(screen.getAllByRole('button', { name: 'Lưu' })[0])

    expect(fetchMock).toHaveBeenCalledWith('/api/admin/content', expect.objectContaining({ method: 'POST' }))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      action: 'update_sense', senseId: 'en:hello#1', glossVi: 'xin chào',
      glossEn: 'A greeting said when meeting someone.',
    })
    expect(refresh).toHaveBeenCalled()
  })

  it('lets a machine-translated gloss be approved unchanged', async () => {
    render(<EntryEditor entry={ENTRY} />)
    expect(screen.getByText('Dịch máy, chưa rà soát')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Đánh dấu đã rà soát' }))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ senseId: 'en:hello#2', glossVi: 'lời chào' })
  })

  it('does not offer to save a reviewed sense nobody changed', () => {
    render(<EntryEditor entry={ENTRY} />)
    expect(screen.getAllByRole('button', { name: 'Lưu' })[0]).toBeDisabled()
  })

  it('flags the entry with a reason', async () => {
    render(<EntryEditor entry={ENTRY} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Lý do đánh dấu' }), 'nghĩa 2 sai')
    await userEvent.click(screen.getByRole('button', { name: 'Đánh dấu' }))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      action: 'flag', entryId: 'en:hello', reason: 'nghĩa 2 sai',
    })
  })

  it('clears a flag with a null reason', async () => {
    render(<EntryEditor entry={{ ...ENTRY, flag: { reason: 'nghĩa 2 sai', flaggedAt: '2026-09-23T02:12:47Z' } }} />)
    expect(screen.getByText('Đang được đánh dấu: nghĩa 2 sai')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Bỏ đánh dấu' }))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ action: 'flag', entryId: 'en:hello', reason: null })
  })

  it('shows a refusal from the server', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'Không còn nghĩa này.' }), { status: 409 }))
    render(<EntryEditor entry={ENTRY} />)
    await userEvent.type(viBoxes()[0], '!')
    await userEvent.click(screen.getAllByRole('button', { name: 'Lưu' })[0])
    expect(await screen.findByText('Không còn nghĩa này.')).toBeInTheDocument()
    expect(refresh).not.toHaveBeenCalled()
  })
})
