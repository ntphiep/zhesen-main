import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AiChatPanel } from '@/components/ai/AiChatPanel'
import { callAi } from '@/lib/ai/browser'

vi.mock('@/lib/ai/browser', () => ({ callAi: vi.fn(), aiEnabled: vi.fn() }))
vi.mock('next/navigation', () => ({ usePathname: () => '/dictionary/zh/%E5%AD%A6%E4%B9%A0' }))

describe('AiChatPanel on a word page', () => {
  it('names the entry so the route can read it', async () => {
    vi.mocked(callAi).mockResolvedValue({ status: 'ok', data: { reply: 'Học.' } })
    render(<AiChatPanel enabled />)
    await userEvent.click(await screen.findByRole('button', { name: 'Hỏi AI' }))
    await userEvent.type(screen.getByLabelText('Câu hỏi cho AI'), 'từ này nghĩa gì')
    await userEvent.click(screen.getByRole('button', { name: 'Gửi' }))
    expect(callAi).toHaveBeenCalledWith('chat', expect.objectContaining({ entryId: 'zh:学习' }),
      expect.any(AbortSignal), expect.any(Function))
  })
})
