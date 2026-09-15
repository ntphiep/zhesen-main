import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AiChatPanel } from '@/components/ai/AiChatPanel'
import { resetAiEnabledCache } from '@/lib/hooks/useAiEnabled'
import { callAi, aiEnabled } from '@/lib/ai/browser'

vi.mock('@/lib/ai/browser', () => ({ callAi: vi.fn(), aiEnabled: vi.fn() }))
vi.mock('next/navigation', () => ({ usePathname: () => '/dictionary/en/adjourned' }))

beforeEach(() => {
  vi.mocked(callAi).mockReset()
  vi.mocked(aiEnabled).mockReset().mockResolvedValue(true)
  resetAiEnabledCache()
})

async function openPanel() {
  render(<AiChatPanel />)
  await userEvent.click(await screen.findByRole('button', { name: 'Hỏi gia sư' }))
}

async function ask(text: string) {
  await userEvent.type(screen.getByLabelText('Câu hỏi cho gia sư'), text)
  await userEvent.click(screen.getByRole('button', { name: 'Gửi' }))
}

describe('AiChatPanel', () => {
  it('renders nothing when the deployment has no model', async () => {
    vi.mocked(aiEnabled).mockResolvedValue(false)
    const { container } = render(<AiChatPanel />)
    expect(container).toBeEmptyDOMElement()
  })

  it('stays closed until the button is pressed', async () => {
    render(<AiChatPanel />)
    expect(await screen.findByRole('button', { name: 'Hỏi gia sư' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Câu hỏi cho gia sư')).toBeNull()
  })

  // Without it, "từ này" in a question has no referent and the answer is a
  // request to say which word.
  it('tells the assistant which page the question came from', async () => {
    vi.mocked(callAi).mockResolvedValue({ status: 'ok', data: { reply: 'Hoãn lại.' } })
    await openPanel()
    await ask('từ này nghĩa gì')

    expect(callAi).toHaveBeenCalledWith('chat', expect.objectContaining({
      context: expect.stringContaining('/dictionary/en/adjourned'),
      messages: [{ role: 'user', text: 'từ này nghĩa gì' }],
    }))
    expect(await screen.findByText('Hoãn lại.')).toBeInTheDocument()
  })

  it('sends the earlier turns back so a follow-up has the thread', async () => {
    vi.mocked(callAi).mockResolvedValue({ status: 'ok', data: { reply: 'Hoãn lại.' } })
    await openPanel()
    await ask('từ này nghĩa gì')
    await screen.findByText('Hoãn lại.')
    await ask('cho một ví dụ')

    expect(vi.mocked(callAi).mock.calls[1][1]).toMatchObject({
      messages: [
        { role: 'user', text: 'từ này nghĩa gì' },
        { role: 'assistant', text: 'Hoãn lại.' },
        { role: 'user', text: 'cho một ví dụ' },
      ],
    })
  })

  // A learner who has to retype the question they just asked stops asking.
  it('keeps the question on screen when the assistant refuses', async () => {
    vi.mocked(callAi).mockResolvedValue({ status: 'error', message: 'Trợ lý đang bận.' })
    await openPanel()
    await ask('từ này nghĩa gì')

    expect(await screen.findByText('Trợ lý đang bận.')).toBeInTheDocument()
    expect(screen.getByText('từ này nghĩa gì')).toBeInTheDocument()
  })

  it('refuses to send an empty question', async () => {
    await openPanel()
    expect(screen.getByRole('button', { name: 'Gửi' })).toBeDisabled()
    expect(callAi).not.toHaveBeenCalled()
  })
})
