import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WordlistReview } from '@/components/practice/WordlistReview'
import { TypingSession } from '@/components/practice/TypingSession'
import { QuizCard } from '@/components/practice/QuizCard'
import { listDueCards, gradeCard, gradeWordById, type ReviewCard } from '@/lib/wordlist/review'
import { listPracticeWords } from '@/lib/wordlist/store'
import { SETTLE_MS } from '@/lib/hooks/useKeyGate'
import type { SrsState } from '@/lib/progress/types'

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/wordlist/review', () => ({ listDueCards: vi.fn(), gradeCard: vi.fn(), gradeWordById: vi.fn() }))
vi.mock('@/lib/wordlist/store', () => ({ listPracticeWords: vi.fn() }))
vi.mock('@/lib/wordlist/activity', () => ({ logActivityDay: vi.fn(async () => {}) }))

const settle = () => new Promise((r) => setTimeout(r, SETTLE_MS + 50))

const state = (vocabId: string): SrsState => ({
  vocabId, stability: 1, difficulty: 5, elapsedDays: 0, scheduledDays: 1,
  learningSteps: 0, reps: 1, lapses: 0, cardState: 'review', dueAt: 0, lastReviewedAt: null,
})
const card = (id: string): ReviewCard => ({
  id, lang: 'en', headword: id, reading: null, ipa: null,
  meaningVi: `nghĩa ${id}`, meaningEn: null, example: null, exampleTranslation: null,
  audioUrl: null, state: state(id),
})
const word = (id: string) => ({ id, headword: id, meaningVi: `nghĩa ${id}`, ipa: null, audioUrl: null, lang: 'en' as const })

beforeEach(() => {
  vi.mocked(listDueCards).mockReset()
  vi.mocked(gradeCard).mockReset()
  vi.mocked(gradeWordById).mockReset().mockResolvedValue(null)
  vi.mocked(listPracticeWords).mockReset()
})

// A held Enter once revealed and graded every due card `good` without the reader seeing one.
describe('review under a held Enter', () => {
  it('grades the card on screen once and leaves the next one unrevealed', async () => {
    vi.mocked(listDueCards).mockResolvedValue([card('A'), card('B'), card('C')])
    vi.mocked(gradeCard).mockImplementation(async (_s, c) => ({ next: state(c.id), applied: true, logged: true }))
    const user = userEvent.setup()
    render(<WordlistReview />)
    await user.click(await screen.findByRole('button', { name: 'Hiện nghĩa' }))
    await settle()
    expect(screen.getByRole('button', { name: 'Tốt' })).toHaveFocus()

    await user.keyboard('{Enter>8}')
    await waitFor(() => expect(screen.getByText('B')).toBeInTheDocument())
    expect(gradeCard).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('nghĩa B')).not.toBeInTheDocument()
  })

  it('ignores Enter on a meaning shown a moment ago', async () => {
    vi.mocked(listDueCards).mockResolvedValue([card('A')])
    const user = userEvent.setup()
    render(<WordlistReview />)
    await user.click(await screen.findByRole('button', { name: 'Hiện nghĩa' }))
    await user.keyboard('{Enter}')
    expect(gradeCard).not.toHaveBeenCalled()
  })
})

// A held Enter once submitted an empty answer on every next word, each graded `again`.
describe('typing under a held Enter', () => {
  it('grades the typed answer once and submits nothing for the next word', async () => {
    vi.mocked(listPracticeWords).mockResolvedValue([word('dog'), word('cat'), word('sun')])
    const user = userEvent.setup()
    render(<TypingSession mode="write" />)
    await user.type(await screen.findByRole('textbox', { name: 'Câu trả lời' }), 'xyz')
    await settle()

    await user.keyboard('{Enter>8}')
    expect(gradeWordById).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Tiếp' })).toBeInTheDocument()
  })

  it('never submits an empty answer', async () => {
    vi.mocked(listPracticeWords).mockResolvedValue([word('dog'), word('cat')])
    const user = userEvent.setup()
    render(<TypingSession mode="write" />)
    await screen.findByRole('textbox', { name: 'Câu trả lời' })
    await settle()
    await user.keyboard('{Enter}')
    expect(gradeWordById).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Kiểm tra' })).toBeDisabled()
  })
})

// The AI chat is a <dialog> on every page: a digit typed while it is open must not pick an answer.
describe('quiz keys beside an open dialog', () => {
  it('picks with 1 to 4 only while no dialog is open', async () => {
    const onSelect = vi.fn()
    const q = { id: '1', headword: 'dog', ipa: null, lang: 'en' as const, options: ['con chó', 'con mèo', 'nước', 'lửa'], answer: 'con chó' }
    const user = userEvent.setup()
    render(<><dialog open><p>chat</p></dialog><QuizCard question={q} selected={null} onSelect={onSelect} onNext={() => {}} /></>)
    await settle()
    await user.keyboard('2')
    expect(onSelect).not.toHaveBeenCalled()
    document.querySelector('dialog')?.removeAttribute('open')
    await user.keyboard('2')
    expect(onSelect).toHaveBeenCalledWith('con mèo')
  })
})
