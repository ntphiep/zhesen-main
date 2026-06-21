import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WordReviewCard } from '@/components/wordlist/WordReviewCard'
import type { ReviewCard } from '@/lib/wordlist/review'

const card: ReviewCard = {
  id: 'w1', lang: 'en', headword: 'dog', reading: null, ipa: 'dɒɡ',
  meaningVi: 'con chó', meaningEn: 'a dog', example: 'The dog ran.', exampleTranslation: 'Con chó chạy.',
  audioUrl: null,
  state: { vocabId: 'w1', intervalDays: 0, ease: 2.5, reps: 0, lapses: 0, dueAt: 0, lastReviewedAt: null },
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
})
