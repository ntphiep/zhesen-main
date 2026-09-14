import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AiTagButton } from '@/components/wordlist/AiTagButton'
import { resetAiEnabledCache } from '@/lib/hooks/useAiEnabled'
import { callAi, aiEnabled } from '@/lib/ai/browser'
import type { UserWord } from '@/lib/wordlist/types'

vi.mock('@/lib/ai/browser', () => ({ callAi: vi.fn(), aiEnabled: vi.fn() }))

function mk(headword: string): UserWord {
  return {
    id: headword, lang: 'en', entryId: null, headword, reading: null, ipa: null, pos: null,
    meaningVi: `nghĩa của ${headword}`, meaningEn: null, level: null, example: null,
    exampleTranslation: null, audioUrl: null, notes: null, status: 'new', tags: [],
    createdAt: '2026-06-19T00:00:00Z', updatedAt: '2026-06-19T00:00:00Z',
  }
}

beforeEach(() => {
  vi.mocked(callAi).mockReset()
  vi.mocked(aiEnabled).mockReset().mockResolvedValue(true)
  resetAiEnabledCache()
})

describe('AiTagButton', () => {
  it('renders nothing when the deployment has no model', () => {
    vi.mocked(aiEnabled).mockResolvedValue(false)
    const { container } = render(<AiTagButton words={[mk('invoice')]} existingTags={[]} onTagged={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('sends the words and the tags already in use', async () => {
    vi.mocked(callAi).mockResolvedValue({ status: 'ok', data: { tags: [{ headword: 'invoice', tags: ['kế toán'] }] } })
    const onTagged = vi.fn()
    render(<AiTagButton words={[mk('invoice')]} existingTags={['văn phòng']} onTagged={onTagged} />)
    await userEvent.click(await screen.findByRole('button', { name: /Gắn thẻ bằng trợ lý/i }))

    expect(callAi).toHaveBeenCalledWith('tags', {
      words: [{ headword: 'invoice', meaningVi: 'nghĩa của invoice' }],
      existing: ['văn phòng'],
    })
    await waitFor(() => expect(onTagged).toHaveBeenCalledWith(new Map([['invoice', ['kế toán']]])))
  })

  // The model is asked to keep the order but a dropped line would shift every tag
  // onto the wrong word, so the answer is matched by headword.
  it('ignores a row for a word that was not sent', async () => {
    vi.mocked(callAi).mockResolvedValue({
      status: 'ok',
      data: { tags: [{ headword: 'invoice', tags: ['kế toán'] }, { headword: 'elsewhere', tags: ['du lịch'] }] },
    })
    const onTagged = vi.fn()
    render(<AiTagButton words={[mk('invoice')]} existingTags={[]} onTagged={onTagged} />)
    await userEvent.click(await screen.findByRole('button', { name: /Gắn thẻ bằng trợ lý/i }))
    await waitFor(() => expect(onTagged).toHaveBeenCalledWith(new Map([['invoice', ['kế toán']]])))
  })

  // A selection larger than one request is split, and a failure late in the run
  // must not throw away the rounds that already answered.
  it('keeps the earlier rounds when a later one fails', async () => {
    const words = Array.from({ length: 25 }, (_, i) => mk(`w${i}`))
    vi.mocked(callAi)
      .mockResolvedValueOnce({ status: 'ok', data: { tags: [{ headword: 'w0', tags: ['công sở'] }] } })
      .mockResolvedValueOnce({ status: 'error', message: 'Trợ lý đang bận.' })
    const onTagged = vi.fn()
    render(<AiTagButton words={words} existingTags={[]} onTagged={onTagged} />)
    await userEvent.click(await screen.findByRole('button', { name: /Gắn thẻ bằng trợ lý/i }))

    expect(await screen.findByText('Trợ lý đang bận.')).toBeInTheDocument()
    expect(callAi).toHaveBeenCalledTimes(2)
    expect(onTagged).toHaveBeenCalledWith(new Map([['w0', ['công sở']]]))
  })

  it('writes nothing when the assistant returned no usable row', async () => {
    vi.mocked(callAi).mockResolvedValue({ status: 'error', message: 'Trợ lý gặp lỗi.' })
    const onTagged = vi.fn()
    render(<AiTagButton words={[mk('invoice')]} existingTags={[]} onTagged={onTagged} />)
    await userEvent.click(await screen.findByRole('button', { name: /Gắn thẻ bằng trợ lý/i }))
    expect(await screen.findByText('Trợ lý gặp lỗi.')).toBeInTheDocument()
    expect(onTagged).not.toHaveBeenCalled()
  })
})
