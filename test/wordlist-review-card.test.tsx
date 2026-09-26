import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WordReviewCard } from '@/components/practice/WordReviewCard'
import type { ReviewCard } from '@/lib/wordlist/review'

const card: ReviewCard = {
  id: 'w1', lang: 'en', headword: 'dog', reading: null, ipa: 'dɒɡ',
  meaningVi: 'con chó', meaningEn: 'a dog', example: 'The dog ran.', exampleTranslation: 'Con chó chạy.',
  audioUrl: null,
  state: { vocabId: 'w1', stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, learningSteps: 0, reps: 0, lapses: 0, cardState: 'new', dueAt: 0, lastReviewedAt: null },
}

describe('WordReviewCard', () => {
  it('hides the meaning until revealed', () => {
    render(<WordReviewCard card={card} revealed={false} onReveal={() => {}} onGrade={() => {}} />)
    expect(screen.getByText('dog')).toBeInTheDocument()
    expect(screen.queryByText('con chó')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hiện nghĩa' })).toBeInTheDocument()
  })

  it('reveals meaning and reports the chosen grade', async () => {
    const onGrade = vi.fn()
    render(<WordReviewCard card={card} revealed onReveal={() => {}} onGrade={onGrade} />)
    expect(screen.getByText('con chó')).toBeInTheDocument()
    expect(screen.getByText('The dog ran.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Tốt' }))
    expect(onGrade).toHaveBeenCalledWith('good')
  })

  it('links a Commons recording to its file page and a card without one to nothing', () => {
    const { rerender } = render(<WordReviewCard card={card} revealed={false} onReveal={() => {}} onGrade={() => {}} />)
    expect(screen.queryByRole('link', { name: 'nguồn' })).not.toBeInTheDocument()
    const recorded = { ...card, audioUrl: 'https://upload.wikimedia.org/wikipedia/commons/1/1e/En-us-dog.ogg' }
    rerender(<WordReviewCard card={recorded} revealed={false} onReveal={() => {}} onGrade={() => {}} />)
    expect(screen.getByRole('link', { name: 'nguồn' })).toHaveAttribute('href', 'https://commons.wikimedia.org/wiki/File:En-us-dog.ogg')
  })
})
