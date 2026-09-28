import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
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
  await userEvent.click(await screen.findByRole('button', { name: 'Hỏi trợ lý' }))
}

async function ask(text: string) {
  await userEvent.type(screen.getByLabelText('Câu hỏi cho trợ lý'), text)
  await userEvent.click(screen.getByRole('button', { name: 'Gửi' }))
}

describe('AiChatPanel', () => {
  it('renders nothing when the deployment has no model', async () => {
    vi.mocked(aiEnabled).mockResolvedValue(false)
    const { container } = render(<AiChatPanel />)
    expect(container).toBeEmptyDOMElement()
  })

  // The layout already knows the answer, so a page load should not spend a request
  // asking again. Passing it also has to settle the question for the three other
  // components that call useAiEnabled() with no argument.
  it('asks nothing when the server has already answered', async () => {
    render(<AiChatPanel enabled />)
    expect(await screen.findByRole('button', { name: 'Hỏi trợ lý' })).toBeInTheDocument()
    expect(aiEnabled).not.toHaveBeenCalled()
  })

  it('renders nothing when the server says the deployment has no model', () => {
    const { container } = render(<AiChatPanel enabled={false} />)
    expect(container).toBeEmptyDOMElement()
    expect(aiEnabled).not.toHaveBeenCalled()
  })

  it('stays closed until the button is pressed', async () => {
    render(<AiChatPanel />)
    expect(await screen.findByRole('button', { name: 'Hỏi trợ lý' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Câu hỏi cho trợ lý')).toBeNull()
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
    }), expect.any(AbortSignal), expect.any(Function))
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

  // A two-sentence reply took 12,179 ms with nothing changing on screen.
  it('shows the reply while it is still arriving', async () => {
    vi.mocked(callAi).mockImplementation(async (_task, _input, _signal, onText) => {
      onText?.('Hoãn lại')
      return new Promise(() => {})
    })
    await openPanel()
    await ask('từ này nghĩa gì')
    expect(await screen.findByText('Hoãn lại')).toBeInTheDocument()
    expect(screen.queryByText('Đang trả lời…')).toBeNull()
  })

  it('stops a reply on Dừng, aborting the request and keeping the question', async () => {
    let signal: AbortSignal | undefined
    vi.mocked(callAi).mockImplementation((_task, _input, s, onText) => {
      signal = s
      onText?.('Hoãn')
      return new Promise((_, reject) => {
        s?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })
    })
    await openPanel()
    await ask('từ này nghĩa gì')
    await userEvent.click(await screen.findByRole('button', { name: 'Dừng' }))

    expect(signal?.aborted).toBe(true)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Dừng' })).toBeNull())
    expect(screen.queryByText('Hoãn')).toBeNull()
    expect(screen.getByText('từ này nghĩa gì')).toBeInTheDocument()
    expect(screen.queryByText('Chưa gửi được câu hỏi. Thử lại.')).toBeNull()
  })

  // A modal <dialog> is what gives Escape, the focus trap and focus restore; jsdom
  // implements none of the three, so what is checkable here is that it is one.
  it('opens as a modal dialog with focus in the question box', async () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal')
    await openPanel()
    expect(showModal).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('dialog', { name: 'Trợ lý Zhesen' })).toHaveAttribute('open')
    expect(screen.getByLabelText('Câu hỏi cho trợ lý')).toHaveFocus()
    showModal.mockRestore()
  })

  // Escape closes a modal dialog in the browser before React hears of it, so the panel
  // has to follow the dialog's close event or the next open finds it already open.
  it('follows the browser closing it, as Escape does, and opens again', async () => {
    await openPanel()
    const dialog = screen.getByRole('dialog', { name: 'Trợ lý Zhesen' }) as HTMLDialogElement
    act(() => dialog.close())
    expect(screen.queryByLabelText('Câu hỏi cho trợ lý')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Hỏi trợ lý' }))
    expect(dialog).toHaveAttribute('open')
  })
})
