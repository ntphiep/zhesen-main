import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AiCoach } from '@/components/ai/AiCoach'
import { resetAiEnabledCache } from '@/lib/hooks/useAiEnabled'
import { callAi, aiEnabled } from '@/lib/ai/browser'

vi.mock('@/lib/ai/browser', () => ({ callAi: vi.fn(), aiEnabled: vi.fn() }))

const full = {
  mnemonic: 'cover + age: phạm vi được che phủ',
  collocations: ['insurance coverage', 'media coverage'],
  examples: [{ text: 'The policy offers full coverage.', vi: 'Hợp đồng bảo hiểm này bao trọn.' }],
  confusables: [{ word: 'covering', note: 'là vật che, không phải phạm vi' }],
}

beforeEach(() => {
  vi.mocked(callAi).mockReset()
  vi.mocked(aiEnabled).mockReset().mockResolvedValue(true)
  resetAiEnabledCache()
})

describe('AiCoach', () => {
  it('renders nothing when the deployment has no model', () => {
    vi.mocked(aiEnabled).mockResolvedValue(false)
    const { container } = render(<AiCoach lang="en" headword="coverage" meaningVi={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  // Behind a button on purpose: a model call is the most expensive thing a click
  // can trigger here, and expanding a row usually means wanting the dictionary
  // entry that is already on screen.
  it('asks nothing until the button is pressed', async () => {
    render(<AiCoach lang="en" headword="coverage" meaningVi={null} />)
    expect(await screen.findByRole('button', { name: /Hỏi trợ lý/i })).toBeInTheDocument()
    expect(callAi).not.toHaveBeenCalled()
  })

  it('shows every section the assistant filled in', async () => {
    vi.mocked(callAi).mockResolvedValue({ status: 'ok', data: full })
    render(<AiCoach lang="en" headword="coverage" meaningVi="mức bảo hiểm" />)
    await userEvent.click(await screen.findByRole('button', { name: /Hỏi trợ lý/i }))

    expect(await screen.findByText(full.mnemonic)).toBeInTheDocument()
    expect(screen.getByText('insurance coverage')).toBeInTheDocument()
    expect(screen.getByText('The policy offers full coverage.')).toBeInTheDocument()
    expect(screen.getByText('covering')).toBeInTheDocument()
    expect(callAi).toHaveBeenCalledWith('coach', { lang: 'en', headword: 'coverage', meaningVi: 'mức bảo hiểm' })
  })

  // The model is told not to guess, so every field coming back empty is a correct
  // answer, not a failure -- and must not render as four empty headings.
  it('says so when the assistant has nothing to add', async () => {
    vi.mocked(callAi).mockResolvedValue({
      status: 'ok',
      data: { mnemonic: '', collocations: [], examples: [], confusables: [] },
    })
    render(<AiCoach lang="zh" headword="囍" meaningVi={null} />)
    await userEvent.click(await screen.findByRole('button', { name: /Hỏi trợ lý/i }))
    expect(await screen.findByText(/không có gì thêm/i)).toBeInTheDocument()
    expect(screen.queryByText('Mẹo nhớ')).toBeNull()
  })

  it('offers a retry after a failure and shows why', async () => {
    vi.mocked(callAi).mockResolvedValue({ status: 'error', message: 'Trợ lý phản hồi quá chậm.' })
    render(<AiCoach lang="en" headword="coverage" meaningVi={null} />)
    await userEvent.click(await screen.findByRole('button', { name: /Hỏi trợ lý/i }))
    expect(await screen.findByText('Trợ lý phản hồi quá chậm.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Thử lại/i })).toBeInTheDocument()
  })
})
