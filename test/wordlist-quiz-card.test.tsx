import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QuizCard } from '@/components/wordlist/QuizCard'
import type { QuizQuestion } from '@/lib/wordlist/quiz'

const q: QuizQuestion = {
  id: '1', headword: 'dog', ipa: 'dɒɡ', lang: 'en',
  options: ['con chó', 'con mèo', 'nước', 'lửa'], answer: 'con chó',
}

describe('QuizCard', () => {
  it('reports the chosen option and hides "Tiếp" until answered', async () => {
    const onSelect = vi.fn()
    render(<QuizCard question={q} selected={null} onSelect={onSelect} onNext={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Tiếp' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'con mèo' }))
    expect(onSelect).toHaveBeenCalledWith('con mèo')
  })

  it('locks options and shows "Tiếp" once answered', async () => {
    const onNext = vi.fn()
    render(<QuizCard question={q} selected="con mèo" onSelect={() => {}} onNext={onNext} />)
    expect(screen.getByRole('button', { name: 'con chó' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Tiếp' }))
    expect(onNext).toHaveBeenCalled()
  })
})
