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

// A saved word often has no example; the learner layer usually has one.
describe('WordReviewCard back from the learner layer', () => {
  const zh: ReviewCard = {
    ...card, id: 'w2', lang: 'zh', headword: '学习', ipa: 'xué xí', meaningVi: 'học', meaningEn: null,
    example: null, exampleTranslation: null, notes: 'Hay đi với 知识.',
    learner: {
      gist: ['học', 'học tập'],
      example: { text: '我们一起学习。', reading: 'wǒmen yìqǐ xuéxí.', vi: 'Chúng ta cùng học.', byModel: true },
    },
  }

  it('shows the learner example without a source mark, the extra terms and the notes', () => {
    render(<WordReviewCard card={zh} revealed onReveal={() => {}} onGrade={() => {}} />)
    expect(screen.getByText('我们一起学习。')).toBeInTheDocument()
    expect(screen.getByText('Chúng ta cùng học.')).toBeInTheDocument()
    expect(screen.queryByText('câu soạn mới')).not.toBeInTheDocument()
    expect(screen.getByText('học, học tập')).toBeInTheDocument()
    expect(screen.getByText('Hay đi với 知识.')).toBeInTheDocument()
  })

  it('keeps the saved example and drops a gist that adds no term', () => {
    const saved = { ...zh, example: '他在学习。', exampleTranslation: 'Anh ấy đang học.', learner: { ...zh.learner!, gist: ['Học.'] } }
    render(<WordReviewCard card={saved} revealed onReveal={() => {}} onGrade={() => {}} />)
    expect(screen.getByText('他在学习。')).toBeInTheDocument()
    expect(screen.queryByText('我们一起学习。')).not.toBeInTheDocument()
    expect(screen.queryByText('Học.')).not.toBeInTheDocument()
  })
})
