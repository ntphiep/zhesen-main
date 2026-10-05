import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AiSuggest } from '@/components/search/AiSuggest'
import { resetAiEnabledCache } from '@/lib/hooks/useAiEnabled'
import { callAi, aiEnabled } from '@/lib/ai/browser'

vi.mock('@/lib/ai/browser', () => ({ callAi: vi.fn(), aiEnabled: vi.fn() }))

beforeEach(() => {
  vi.mocked(callAi).mockReset().mockResolvedValue({ status: 'ok', data: { words: [] } })
  vi.mocked(aiEnabled).mockReset().mockResolvedValue(true)
  resetAiEnabledCache()
})

describe('AiSuggest in a lookup box', () => {
  // A Vietnamese query in a box set to Chinese was answered with English first.
  it('sends the box direction and languages with the query', async () => {
    render(<AiSuggest query="cơm" direction="vi" targets={['zh']} />)
    await userEvent.click(await screen.findByRole('button', { name: /Hỏi AI/i }))
    expect(callAi).toHaveBeenCalledWith('suggest', { query: 'cơm', direction: 'vi', targets: ['zh'] })
  })
})
