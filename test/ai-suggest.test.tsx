import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AiSuggest } from '@/components/search/AiSuggest'
import { resetAiEnabledCache } from '@/lib/hooks/useAiEnabled'
import { callAi, aiEnabled } from '@/lib/ai/browser'

vi.mock('@/lib/ai/browser', () => ({ callAi: vi.fn(), aiEnabled: vi.fn() }))

const two = {
  words: [
    { lang: 'en' as const, headword: 'postpone', meaningVi: 'hoãn lại' },
    { lang: 'en' as const, headword: 'reschedule', meaningVi: 'dời lịch' },
  ],
}

beforeEach(() => {
  vi.mocked(callAi).mockReset()
  vi.mocked(aiEnabled).mockReset().mockResolvedValue(true)
  resetAiEnabledCache()
})

describe('AiSuggest', () => {
  it('renders nothing when the deployment has no model', () => {
    vi.mocked(aiEnabled).mockResolvedValue(false)
    const { container } = render(<AiSuggest query="hoãn cuộc họp" />)
    expect(container).toBeEmptyDOMElement()
  })

  // An empty search happens on almost every keystroke while typing, so the call
  // waits for the learner to say the search really is finished.
  it('asks nothing until the button is pressed', async () => {
    render(<AiSuggest query="hoãn cuộc họp" />)
    expect(await screen.findByRole('button', { name: /Hỏi trợ lý/i })).toBeInTheDocument()
    expect(callAi).not.toHaveBeenCalled()
  })

  it('sends each suggestion back through the dictionary', async () => {
    vi.mocked(callAi).mockResolvedValue({ status: 'ok', data: two })
    render(<AiSuggest query="hoãn cuộc họp" />)
    await userEvent.click(await screen.findByRole('button', { name: /Hỏi trợ lý/i }))

    expect(callAi).toHaveBeenCalledWith('suggest', { query: 'hoãn cuộc họp' })
    const link = await screen.findByRole('link', { name: /postpone/ })
    expect(link).toHaveAttribute('href', expect.stringContaining('postpone'))
    expect(screen.getByText('dời lịch')).toBeInTheDocument()
  })

  // These are generated words, not dictionary entries, and the screen has to say so.
  it('labels the list as generated', async () => {
    vi.mocked(callAi).mockResolvedValue({ status: 'ok', data: two })
    render(<AiSuggest query="hoãn cuộc họp" />)
    await userEvent.click(await screen.findByRole('button', { name: /Hỏi trợ lý/i }))
    expect(await screen.findByText(/chưa qua từ điển/i)).toBeInTheDocument()
  })

  it('says so when the assistant has no candidate either', async () => {
    vi.mocked(callAi).mockResolvedValue({ status: 'ok', data: { words: [] } })
    render(<AiSuggest query="qwertyuiop" />)
    await userEvent.click(await screen.findByRole('button', { name: /Hỏi trợ lý/i }))
    expect(await screen.findByText(/không nghĩ ra từ nào/i)).toBeInTheDocument()
  })

  it('shows the refusal rather than an empty list', async () => {
    vi.mocked(callAi).mockResolvedValue({ status: 'error', message: 'Trợ lý đang bận.' })
    render(<AiSuggest query="hoãn cuộc họp" />)
    await userEvent.click(await screen.findByRole('button', { name: /Hỏi trợ lý/i }))
    expect(await screen.findByText('Trợ lý đang bận.')).toBeInTheDocument()
  })

  // Leaving the previous answer on screen would attach suggestions for one search
  // to a different one.
  it('drops the previous answer when the query changes', async () => {
    vi.mocked(callAi).mockResolvedValue({ status: 'ok', data: two })
    const { rerender } = render(<AiSuggest query="hoãn cuộc họp" />)
    await userEvent.click(await screen.findByRole('button', { name: /Hỏi trợ lý/i }))
    expect(await screen.findByText('postpone')).toBeInTheDocument()

    rerender(<AiSuggest query="huỷ cuộc họp" />)
    expect(screen.queryByText('postpone')).toBeNull()
    expect(screen.getByRole('button', { name: /Hỏi trợ lý/i })).toBeInTheDocument()
  })
})
