import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AiTagButton } from '@/components/wordlist/AiTagButton'
import { resetAiEnabledCache } from '@/lib/hooks/useAiEnabled'
import { callAi, aiEnabled } from '@/lib/ai/browser'
import type { LangCode } from '@/lib/languages'
import type { UserWord } from '@/lib/wordlist/types'

vi.mock('@/lib/ai/browser', () => ({ callAi: vi.fn(), aiEnabled: vi.fn() }))

function mk(headword: string, lang: LangCode = 'en'): UserWord {
  return {
    id: `${lang}:${headword}`, lang, entryId: null, headword, reading: null, ipa: null, pos: null,
    meaningVi: `nghĩa của ${headword}`, meaningEn: null, level: null, example: null,
    exampleTranslation: null, audioUrl: null, notes: null, status: 'new', tags: [],
    createdAt: '2026-06-19T00:00:00Z', updatedAt: '2026-06-19T00:00:00Z', fsrsDueAt: '2026-01-01T00:00:00Z', fsrsLapses: 0,
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
    await waitFor(() => expect(onTagged).toHaveBeenCalledWith(new Map([['en:invoice', ['kế toán']]])))
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
    await waitFor(() => expect(onTagged).toHaveBeenCalledWith(new Map([['en:invoice', ['kế toán']]])))
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
    expect(onTagged).toHaveBeenCalledWith(new Map([['en:w0', ['công sở']]]))
  })

  // Without this the run coins a synonym for a category it invented two rounds ago.
  it('feeds tags coined in one round into the next', async () => {
    const words = Array.from({ length: 25 }, (_, i) => mk(`w${i}`))
    vi.mocked(callAi)
      .mockResolvedValueOnce({ status: 'ok', data: { tags: [{ headword: 'w0', tags: ['văn phòng'] }] } })
      .mockResolvedValueOnce({ status: 'ok', data: { tags: [{ headword: 'w20', tags: ['văn phòng'] }] } })
    render(<AiTagButton words={words} existingTags={[]} onTagged={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: /Gắn thẻ bằng trợ lý/i }))

    await waitFor(() => expect(callAi).toHaveBeenCalledTimes(2))
    expect(vi.mocked(callAi).mock.calls[0][1]).toMatchObject({ existing: [] })
    expect(vi.mocked(callAi).mock.calls[1][1]).toMatchObject({ existing: ['văn phòng'] })
  })

  // A wordlist already past the cap is the case where slicing from the wrong end
  // silently drops every tag the run coins, which is the whole point of sending them.
  it('still sends a coined tag when the list is already at the cap', async () => {
    const existingTags = Array.from({ length: 40 }, (_, i) => `chủ đề ${i}`)
    const words = Array.from({ length: 25 }, (_, i) => mk(`w${i}`))
    vi.mocked(callAi)
      .mockResolvedValueOnce({ status: 'ok', data: { tags: [{ headword: 'w0', tags: ['văn phòng'] }] } })
      .mockResolvedValueOnce({ status: 'ok', data: { tags: [{ headword: 'w20', tags: ['văn phòng'] }] } })
    render(<AiTagButton words={words} existingTags={existingTags} onTagged={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: /Gắn thẻ bằng trợ lý/i }))

    await waitFor(() => expect(callAi).toHaveBeenCalledTimes(2))
    const second = vi.mocked(callAi).mock.calls[1][1] as { existing: string[] }
    expect(second.existing).toHaveLength(40)
    expect(second.existing).toContain('văn phòng')
  })

  // "no" is a word in both English and Spanish, so a headword alone cannot name a row.
  it('sends one request per language and keys the answer by language', async () => {
    vi.mocked(callAi)
      .mockResolvedValueOnce({ status: 'ok', data: { tags: [{ headword: 'no', tags: ['phủ định'] }] } })
      .mockResolvedValueOnce({ status: 'ok', data: { tags: [{ headword: 'no', tags: ['tiếng Tây Ban Nha'] }] } })
    const onTagged = vi.fn()
    render(<AiTagButton words={[mk('no', 'en'), mk('no', 'es')]} existingTags={[]} onTagged={onTagged} />)
    await userEvent.click(await screen.findByRole('button', { name: /Gắn thẻ bằng trợ lý/i }))

    await waitFor(() => expect(callAi).toHaveBeenCalledTimes(2))
    expect(onTagged).toHaveBeenCalledWith(
      new Map([['en:no', ['phủ định']], ['es:no', ['tiếng Tây Ban Nha']]]),
    )
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
