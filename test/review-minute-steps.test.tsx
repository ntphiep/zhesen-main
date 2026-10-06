import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SupabaseClient } from '@supabase/supabase-js'
import { WordlistReview } from '@/components/practice/WordlistReview'
import { HomeReviewDeck } from '@/components/home/HomeReviewDeck'
import { listDueCards, gradeCard, gradeWordById, type ReviewCard } from '@/lib/wordlist/review'
import { nextShown } from '@/lib/progress/srs'
import type { SrsState } from '@/lib/progress/types'

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/wordlist/review', () => ({ listDueCards: vi.fn(), gradeCard: vi.fn(), gradeWordById: vi.fn() }))
vi.mock('@/lib/hooks/useGradeSync', () => ({ useGradeSync: () => ({ record: vi.fn(), logDay: vi.fn(), failed: false }) }))

const state = (vocabId: string, cardState: SrsState['cardState'], dueAt: number): SrsState => ({
  vocabId, stability: 1, difficulty: 5, elapsedDays: 0, scheduledDays: 0,
  learningSteps: 0, reps: 1, lapses: 0, cardState, dueAt, lastReviewedAt: null,
})

const card = (id: string): ReviewCard => ({
  id, lang: 'en', headword: id, reading: null, ipa: null,
  meaningVi: `nghĩa ${id}`, meaningEn: null, example: null, exampleTranslation: null,
  audioUrl: null, entryId: null, state: state(id, 'review', 0),
})

beforeEach(() => {
  vi.mocked(listDueCards).mockReset()
  vi.mocked(gradeCard).mockReset()
  vi.mocked(gradeWordById).mockReset()
})

describe('nextShown', () => {
  const now = 1_000_000
  it('skips a card waiting out a minute step', () => {
    const q = [{ state: state('A', 'learning', now + 60_000) }, { state: state('B', 'review', now + 3_600_000) }]
    expect(nextShown(q, now)).toBe(1)
  })
  it('shows a step card once its step is up', () => {
    expect(nextShown([{ state: state('A', 'relearning', now) }], now)).toBe(0)
  })
  it('answers -1 when every card left is waiting', () => {
    expect(nextShown([{ state: state('A', 'learning', now + 1) }], now)).toBe(-1)
  })
})

describe('WordlistReview minute steps', () => {
  it('shows the next due card before one that is waiting out its step', async () => {
    vi.mocked(listDueCards).mockResolvedValue([card('A'), card('B')])
    vi.mocked(gradeCard).mockImplementation(async (_c, c) => ({
      next: state(c.id, 'learning', Date.now() + 60_000), applied: true, logged: true,
    }))
    render(<WordlistReview />)

    fireEvent.click(await screen.findByRole('button', { name: /Hiện nghĩa/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Lại' }))
    await waitFor(() => expect(screen.getByText('B')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /Hiện nghĩa/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Lại' }))
    expect(await screen.findByText('Từ tiếp theo đến hạn sau 1 phút.')).toBeInTheDocument()
  })

  it('shows a waiting card early only when the learner asks', async () => {
    vi.mocked(listDueCards).mockResolvedValue([card('A')])
    vi.mocked(gradeCard).mockResolvedValue({
      next: state('A', 'learning', Date.now() + 10 * 60_000), applied: true, logged: true,
    })
    render(<WordlistReview />)

    fireEvent.click(await screen.findByRole('button', { name: /Hiện nghĩa/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Tốt' }))
    expect(await screen.findByText('Từ tiếp theo đến hạn sau 10 phút.')).toBeInTheDocument()
    expect(screen.queryByText('A')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Ôn ngay' }))
    expect(await screen.findByText('A')).toBeInTheDocument()
  })
})

describe('HomeReviewDeck minute steps', () => {
  it('waits out a step on the home page too, unless the learner asks', async () => {
    vi.mocked(gradeWordById).mockResolvedValue({
      next: state('dog', 'learning', Date.now() + 60_000), applied: true, logged: true,
    })
    render(<HomeReviewDeck cards={[card('dog')]} supabase={{} as SupabaseClient} now={Date.now()} total={1} onGraded={vi.fn()} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Hiện nghĩa' }))
    await userEvent.click(screen.getByRole('button', { name: 'Lại' }))
    expect(await screen.findByText('Từ tiếp theo đến hạn sau 1 phút.')).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Từ đang ôn' })).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Ôn ngay' }))
    expect(await screen.findByRole('article', { name: 'Từ đang ôn' })).toBeInTheDocument()
  })
})
