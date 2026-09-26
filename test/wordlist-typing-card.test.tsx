import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TypingCard, type TypingPrompt } from '@/components/practice/TypingCard'

const word: TypingPrompt = { id: 'w1', headword: 'develop', meaningVi: 'phát triển', ipa: null, audioUrl: null, lang: 'en' }

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

  it('dictation keeps the Commons link, which spells the word, until the answer is checked', () => {
    const recorded = { ...word, audioUrl: 'https://upload.wikimedia.org/wikipedia/commons/1/1e/En-us-develop.ogg' }
    const props = { mode: 'dictation' as const, word: recorded, value: '', onChange: () => {}, onSubmit: () => {}, onNext: () => {} }
    const { container, rerender } = render(<TypingCard {...props} result={null} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(container.innerHTML).not.toContain('En-us-develop')
    rerender(<TypingCard {...props} result="wrong" />)
    expect(screen.getByRole('link', { name: 'nguồn' })).toHaveAttribute('href', 'https://commons.wikimedia.org/wiki/File:En-us-develop.ogg')
  })

  it('dictation audio button never says the headword before the answer is checked', () => {
    const props = { mode: 'dictation' as const, word, value: '', onChange: () => {}, onSubmit: () => {}, onNext: () => {} }
    const { rerender } = render(<TypingCard {...props} result={null} />)
    expect(screen.queryByRole('button', { name: /develop/i })).not.toBeInTheDocument()
    const button = screen.getByRole('button', { name: 'Phát âm từ cần gõ' })
    expect(button.getAttribute('aria-label')).not.toContain(word.headword)
    rerender(<TypingCard {...props} result="correct" />)
    expect(screen.getByRole('button', { name: `Phát âm ${word.headword}` })).toBeInTheDocument()
  })
})
