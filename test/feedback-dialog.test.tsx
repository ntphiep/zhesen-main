import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FeedbackButton } from '@/components/lookup/FeedbackButton'
import type { DictSense } from '@/lib/dictionary/types'

/** en:takeoff's first two senses as the word page carries them. */
const SENSES: DictSense[] = [
  { id: 'en:takeoff#1', pos: 'noun', glossVi: 'cởi', glossEn: 'The rising of an aircraft into flight.', senseOrder: 1 },
  { id: 'en:takeoff#2', pos: 'noun', glossVi: 'sự bắt chước, sự nhại', glossEn: 'An imitation or parody.', senseOrder: 2 },
]

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue(new Response('{"ok":true}', { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

async function openDialog() {
  render(<FeedbackButton entryId="en:takeoff" senses={SENSES} />)
  await userEvent.click(screen.getByRole('button', { name: 'Góp ý' }))
  return screen.getByRole('dialog', { name: 'Góp ý' })
}

describe('FeedbackButton', () => {
  it('renders only the button until opened', () => {
    render(<FeedbackButton entryId="en:takeoff" senses={SENSES} />)
    expect(screen.getByRole('button', { name: 'Góp ý' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('offers the whole word and each sense under its Vietnamese label', async () => {
    const dialog = await openDialog()
    const options = within(within(dialog).getByRole('combobox', { name: 'Nghĩa' })).getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual(['Cả từ', '1. cởi', '2. sự bắt chước'])
    expect(within(dialog).getByRole('radio', { name: 'Nghĩa sai' })).toBeChecked()
    expect(within(dialog).getByRole('radio', { name: 'Ví dụ sai' })).toBeInTheDocument()
    expect(within(dialog).getByRole('radio', { name: 'Khác' })).toBeInTheDocument()
  })

  it('does not send until the reason is filled in', async () => {
    const dialog = await openDialog()
    const send = within(dialog).getByRole('button', { name: 'Gửi' })
    expect(within(dialog).getByRole('textbox', { name: 'Vì sao sai' })).toBeRequired()
    expect(send).toBeDisabled()
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Vì sao sai' }), '   ')
    expect(send).toBeDisabled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends the chosen sense, kind, reason and suggestion, then confirms', async () => {
    const dialog = await openDialog()
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Nghĩa' }), 'en:takeoff#1')
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Vì sao sai' }), 'cởi là take off')
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Nghĩa đúng' }), 'sự cất cánh')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Gửi' }))

    expect(fetchMock).toHaveBeenCalledWith('/dictionary/feedback', expect.objectContaining({ method: 'POST' }))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      entryId: 'en:takeoff', senseId: 'en:takeoff#1', kind: 'meaning', message: 'cởi là take off', suggestion: 'sự cất cánh',
    })
    expect(await within(dialog).findByText('Đã gửi góp ý.')).toBeInTheDocument()
  })

  it('reports on the whole word with another kind and no suggestion', async () => {
    const dialog = await openDialog()
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Ví dụ sai' }))
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Vì sao sai' }), 'câu ví dụ dịch sai')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Gửi' }))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      entryId: 'en:takeoff', senseId: null, kind: 'example', message: 'câu ví dụ dịch sai', suggestion: null,
    })
  })

  it('says it was not sent when the request fails, and keeps the draft', async () => {
    fetchMock.mockResolvedValue(new Response('{"error":"x"}', { status: 502 }))
    const dialog = await openDialog()
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Vì sao sai' }), 'sai nghĩa')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Gửi' }))
    expect(await within(dialog).findByText('Chưa gửi được. Thử lại.')).toBeInTheDocument()
    expect(within(dialog).getByRole('textbox', { name: 'Vì sao sai' })).toHaveValue('sai nghĩa')
  })

  it('says it was not sent when the network is down', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const dialog = await openDialog()
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Vì sao sai' }), 'sai nghĩa')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Gửi' }))
    expect(await within(dialog).findByText('Chưa gửi được. Thử lại.')).toBeInTheDocument()
  })

  it('says it was not sent when the reader is over the hourly limit', async () => {
    fetchMock.mockResolvedValue(new Response('{"error":"x"}', { status: 429 }))
    const dialog = await openDialog()
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Vì sao sai' }), 'sai nghĩa')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Gửi' }))
    expect(await within(dialog).findByText('Chưa gửi được. Thử lại.')).toBeInTheDocument()
  })

  it('closes on Hủy', async () => {
    const dialog = await openDialog()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Hủy' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
