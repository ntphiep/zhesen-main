import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TypingCard, type TypingPrompt } from '@/components/wordlist/TypingCard'

const word: TypingPrompt = { headword: 'develop', meaningVi: 'phát triển', ipa: null, audioUrl: null, lang: 'en' }

describe('TypingCard', () => {
  it('write mode prompts with the meaning and submits the typed answer', async () => {
    const onSubmit = vi.fn()
    render(<TypingCard mode="write" word={word} value="develop" result={null} onChange={() => {}} onSubmit={onSubmit} onNext={() => {}} />)
    expect(screen.getByText('phát triển')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Kiểm tra' }))
    expect(onSubmit).toHaveBeenCalled()
  })

  it('shows the answer and "Tiếp" once graded', async () => {
    const onNext = vi.fn()
    render(<TypingCard mode="write" word={word} value="develp" result="close" onChange={() => {}} onSubmit={() => {}} onNext={onNext} />)
    expect(screen.getByText(/Gần đúng/)).toBeInTheDocument()
    expect(screen.getByText('develop')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Tiếp' }))
    expect(onNext).toHaveBeenCalled()
  })
})
