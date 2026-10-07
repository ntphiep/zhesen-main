import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AiChatPanel } from '@/components/ai/AiChatPanel'
import { resetAiEnabledCache } from '@/lib/hooks/useAiEnabled'
import { callAi, aiEnabled } from '@/lib/ai/browser'
import { askAi } from '@/lib/ai/ask'

vi.mock('@/lib/ai/browser', () => ({ callAi: vi.fn(), aiEnabled: vi.fn() }))
vi.mock('next/navigation', () => ({ usePathname: () => '/dictionary/en/adjourned' }))

beforeEach(() => {
  vi.mocked(callAi).mockReset()
  vi.mocked(aiEnabled).mockReset().mockResolvedValue(true)
  resetAiEnabledCache()
})

async function openPanel() {
  render(<AiChatPanel />)
  await userEvent.click(await screen.findByRole('button', { name: 'Hỏi AI' }))
}

async function ask(text: string) {
  await userEvent.type(screen.getByLabelText('Câu hỏi cho AI'), text)
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
    expect(await screen.findByRole('button', { name: 'Hỏi AI' })).toBeInTheDocument()
    expect(aiEnabled).not.toHaveBeenCalled()
  })

  it('renders nothing when the server says the deployment has no model', () => {
    const { container } = render(<AiChatPanel enabled={false} />)
    expect(container).toBeEmptyDOMElement()
    expect(aiEnabled).not.toHaveBeenCalled()
  })

  // At 390x844 the launcher sat on the audio button of the last example row. jsdom lays
  // nothing out, so the room left under the page is asserted by its class.
  it('leaves room at the end of the page for the launcher', async () => {
    const { container } = render(<AiChatPanel enabled />)
    const launcher = await screen.findByRole('button', { name: 'Hỏi AI' })
    expect(launcher).toHaveClass('bottom-5')
    const spacer = container.querySelector('[aria-hidden="true"]')
    expect(spacer).toHaveClass('h-20', 'shrink-0')
  })

  it('stays closed until the button is pressed', async () => {
    render(<AiChatPanel />)
    expect(await screen.findByRole('button', { name: 'Hỏi AI' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Câu hỏi cho AI')).toBeNull()
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

  // Dừng unmounts itself, which dropped focus to the page behind the modal.
  it('returns focus to the question box after Dừng', async () => {
    vi.mocked(callAi).mockImplementation((_task, _input, s) => new Promise((_, reject) => {
      s?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
    await openPanel()
    await ask('từ này nghĩa gì')
    await userEvent.click(await screen.findByRole('button', { name: 'Dừng' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Dừng' })).toBeNull())
    expect(screen.getByLabelText('Câu hỏi cho AI')).toHaveFocus()
  })

  // A modal <dialog> is what gives Escape, the focus trap and focus restore; jsdom
  // implements none of the three, so what is checkable here is that it is one.
  it('opens as a modal dialog with focus in the question box', async () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal')
    await openPanel()
    expect(showModal).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('dialog', { name: 'Hỏi AI' })).toHaveAttribute('open')
    expect(screen.getByLabelText('Câu hỏi cho AI')).toHaveFocus()
    showModal.mockRestore()
  })

  // Escape closes a modal dialog in the browser before React hears of it, so the panel
  // has to follow the dialog's close event or the next open finds it already open.
  it('follows the browser closing it, as Escape does, and opens again', async () => {
    await openPanel()
    const dialog = screen.getByRole('dialog', { name: 'Hỏi AI' }) as HTMLDialogElement
    act(() => dialog.close())
    expect(screen.queryByLabelText('Câu hỏi cho AI')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Hỏi AI' }))
    expect(dialog).toHaveAttribute('open')
  })

  // A page asking about one item opens the panel on it, and the item leads every question.
  it('opens on an item a page asks about and sends it ahead of the question', async () => {
    vi.mocked(callAi).mockResolvedValue({ status: 'ok', data: { reply: 'Vì by chỉ hạn chót.' } })
    render(<AiChatPanel enabled />)
    act(() => askAi({ label: 'câu 101', seed: 'Câu 101. Đáp án: (A) by.', draft: 'Giải thích thêm câu này.' }))
    expect(screen.getByText('Hỏi về câu 101. Câu trả lời do AI viết.')).toBeInTheDocument()
    expect(screen.getByLabelText('Câu hỏi cho AI')).toHaveValue('Giải thích thêm câu này.')
    await userEvent.click(screen.getByRole('button', { name: 'Gửi' }))
    expect(callAi).toHaveBeenCalledWith('chat', expect.objectContaining({
      messages: [
        { role: 'user', text: 'Câu 101. Đáp án: (A) by.' },
        { role: 'user', text: 'Giải thích thêm câu này.' },
      ],
    }), expect.any(AbortSignal), expect.any(Function))
  })

  // A reply still arriving when the page asks about the next item belongs to the old thread.
  it('aborts a reply in flight when a page asks about another item and drops its late answer', async () => {
    let signal: AbortSignal | undefined
    let reply: (v: { status: 'ok'; data: { reply: string } }) => void = () => {}
    vi.mocked(callAi).mockImplementationOnce((_task, _input, s) => {
      signal = s
      return new Promise((resolve) => { reply = resolve })
    })
    render(<AiChatPanel enabled />)
    act(() => askAi({ label: 'câu 101', seed: 'Câu 101.', draft: 'Câu cũ?' }))
    await userEvent.click(screen.getByRole('button', { name: 'Gửi' }))
    act(() => askAi({ label: 'câu 102', seed: 'Câu 102.', draft: 'Câu mới?' }))

    expect(signal?.aborted).toBe(true)
    await act(async () => reply({ status: 'ok', data: { reply: 'Trả lời cũ.' } }))
    expect(screen.queryByText('Trả lời cũ.')).toBeNull()
    expect(screen.queryByText('Câu cũ?')).toBeNull()
    expect(screen.getByText('Hỏi về câu 102. Câu trả lời do AI viết.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gửi' })).toBeEnabled()
  })
})
