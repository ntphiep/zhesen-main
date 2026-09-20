import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TextLookup } from '@/components/search/TextLookup'
import { resetAiEnabledCache } from '@/lib/hooks/useAiEnabled'
import { callAi, aiEnabled } from '@/lib/ai/browser'

vi.mock('@/lib/ai/browser', () => ({ callAi: vi.fn(), aiEnabled: vi.fn() }))

const entry = (headword: string) => ({
  id: `en:${headword}`, lang: 'en', headword, traditional: null, level: null,
  ipa: null, pos: 'noun,verb', glossVi: 'Con chó', glossEn: null, audioUrl: null,
})

const answer = {
  lang: 'en',
  words: [
    { text: 'The', entry: null },
    { text: 'dog', entry: entry('dog') },
  ],
}

function stubLookup(body: unknown = answer, ok = true) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok, json: async () => body })))
}

beforeEach(() => {
  vi.mocked(callAi).mockReset()
  vi.mocked(aiEnabled).mockReset().mockResolvedValue(false)
  resetAiEnabledCache()
  stubLookup()
})

describe('TextLookup', () => {
  // The whole point of layer one: it never depends on a model, so a deployment that
  // cannot reach the assistant still answers a pasted sentence.
  it('lists every word with its meaning when no assistant is configured', async () => {
    render(<TextLookup />)
    await userEvent.type(screen.getByLabelText(/Dán một cụm từ/), 'The dog')
    await userEvent.click(screen.getByRole('button', { name: 'Tra từng từ' }))

    const link = await screen.findByRole('link', { name: /dog/ })
    expect(link).toHaveAttribute('href', '/dictionary/en/dog')
    expect(screen.getByText('Con chó')).toBeInTheDocument()
    expect(screen.getByTitle('Danh từ')).toHaveTextContent('n.')
    expect(screen.queryByRole('button', { name: /trợ lý dịch/i })).toBeNull()
  })

  it('says which words the dictionary does not hold', async () => {
    render(<TextLookup />)
    await userEvent.type(screen.getByLabelText(/Dán một cụm từ/), 'The dog')
    await userEvent.click(screen.getByRole('button', { name: 'Tra từng từ' }))
    expect(await screen.findByText('Không có trong từ điển')).toBeInTheDocument()
  })

  it('offers the whole-passage translation once an assistant is configured', async () => {
    vi.mocked(aiEnabled).mockResolvedValue(true)
    vi.mocked(callAi).mockResolvedValue({ status: 'ok', data: { translationVi: 'Con chó' } })
    render(<TextLookup />)
    await userEvent.type(screen.getByLabelText(/Dán một cụm từ/), 'The dog')
    await userEvent.click(screen.getByRole('button', { name: 'Tra từng từ' }))
    await userEvent.click(await screen.findByRole('button', { name: /trợ lý dịch/i }))

    expect(callAi).toHaveBeenCalledWith('translate', { lang: 'en', text: 'The dog' }, expect.anything())
    expect(await screen.findByText(/chưa qua từ điển/i)).toBeInTheDocument()
  })

  // A paragraph takes longer than the twelve seconds one word already takes (#10),
  // so the wait has to be escapable.
  it('can cancel a translation in flight', async () => {
    vi.mocked(aiEnabled).mockResolvedValue(true)
    vi.mocked(callAi).mockImplementation((_task, _input, signal) => new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => {
        const err = new Error('aborted')
        err.name = 'AbortError'
        reject(err)
      })
    }))
    render(<TextLookup />)
    await userEvent.type(screen.getByLabelText(/Dán một cụm từ/), 'The dog')
    await userEvent.click(screen.getByRole('button', { name: 'Tra từng từ' }))
    await userEvent.click(await screen.findByRole('button', { name: /trợ lý dịch/i }))
    await userEvent.click(await screen.findByRole('button', { name: 'Huỷ' }))

    expect(await screen.findByRole('button', { name: /trợ lý dịch/i })).toBeInTheDocument()
    expect(screen.queryByText(/Trợ lý đang dịch/)).toBeNull()
  })

  it('reports a refusal from the route instead of an empty word list', async () => {
    stubLookup({ error: 'Đoạn văn bản quá dài hoặc để trống.' }, false)
    render(<TextLookup />)
    await userEvent.type(screen.getByLabelText(/Dán một cụm từ/), 'The dog')
    await userEvent.click(screen.getByRole('button', { name: 'Tra từng từ' }))
    expect(await screen.findByText('Đoạn văn bản quá dài hoặc để trống.')).toBeInTheDocument()
  })

  it('refuses to send a passage over the cap', async () => {
    render(<TextLookup />)
    const box = screen.getByLabelText(/Dán một cụm từ/)
    await userEvent.click(box)
    await userEvent.paste('x'.repeat(1001))
    expect(screen.getByRole('button', { name: 'Tra từng từ' })).toBeDisabled()
    expect(fetch).not.toHaveBeenCalled()
  })
})
