import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { WordlistReview } from '@/components/practice/WordlistReview'
import { listDueCards, gradeCard, type GradeResult, type ReviewCard } from '@/lib/wordlist/review'
import type { SrsState } from '@/lib/progress/types'

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/wordlist/review', () => ({ listDueCards: vi.fn(), gradeCard: vi.fn() }))

const state = (vocabId: string): SrsState => ({
  vocabId, stability: 1, difficulty: 5, elapsedDays: 0, scheduledDays: 1,
  learningSteps: 0, reps: 1, lapses: 0, cardState: 'review', dueAt: 0, lastReviewedAt: null,
})

const card = (id: string): ReviewCard => ({
  id, lang: 'en', headword: id, reading: null, ipa: null,
  meaningVi: `nghĩa ${id}`, meaningEn: null, example: null, exampleTranslation: null,
  audioUrl: null, state: state(id),
})

beforeEach(() => {
  vi.mocked(listDueCards).mockReset()
  vi.mocked(gradeCard).mockReset()
})

describe('WordlistReview', () => {
  it('walks the queue one card at a time', async () => {
    vi.mocked(listDueCards).mockResolvedValue([card('A'), card('B')])
    vi.mocked(gradeCard).mockImplementation(async (_c, cardArg) => ({ next: state(cardArg.id), applied: true, logged: true }))
    render(<WordlistReview />)

    fireEvent.click(await screen.findByRole('button', { name: /Hiện nghĩa/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Tốt' }))
    await waitFor(() => expect(screen.getByText('B')).toBeInTheDocument())
  })

  // No disabled state while the grade is in flight: `current` has not changed
  // yet, so a second tap graded the SAME card again from its old state and ran
  // slice(1) twice. On a phone that is one double-tap, or one tap on a slow
  // connection: card B is never shown, and A's schedule is written twice.
  it('grades once and skips nothing when the button is tapped twice', async () => {
    vi.mocked(listDueCards).mockResolvedValue([card('A'), card('B')])
    let release!: (s: GradeResult) => void
    vi.mocked(gradeCard).mockImplementation(
      () => new Promise<GradeResult>((resolve) => { release = resolve }),
    )
    render(<WordlistReview />)

    fireEvent.click(await screen.findByRole('button', { name: /Hiện nghĩa/i }))
    const good = screen.getByRole('button', { name: 'Tốt' })
    fireEvent.click(good)
    fireEvent.click(good)

    expect(gradeCard).toHaveBeenCalledTimes(1)
    release({ next: state('A'), applied: true, logged: true })
    await waitFor(() => expect(screen.getByText('B')).toBeInTheDocument())
    expect(screen.queryByText(/Hết từ cần ôn/)).toBeNull()
  })

  // A new word answered Tốt sits on a ten-minute learning step and must be seen again in the
  // session before it graduates to review.
  it('brings back a word left on a learning step, then lets it go once it graduates', async () => {
    vi.mocked(listDueCards).mockResolvedValue([card('A'), card('B')])
    const seen: string[] = []
    vi.mocked(gradeCard).mockImplementation(async (_c, cardArg) => {
      seen.push(cardArg.id)
      const first = seen.filter((id) => id === cardArg.id).length === 1
      return { next: { ...state(cardArg.id), cardState: first && cardArg.id === 'A' ? 'learning' : 'review' }, applied: true, logged: true }
    })
    render(<WordlistReview />)

    for (const next of ['B', 'A']) {
      fireEvent.click(await screen.findByRole('button', { name: /Hiện nghĩa/i }))
      fireEvent.click(screen.getByRole('button', { name: 'Tốt' }))
      await waitFor(() => expect(screen.getByText(next)).toBeInTheDocument())
    }
    fireEvent.click(await screen.findByRole('button', { name: /Hiện nghĩa/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Tốt' }))
    expect(await screen.findByText('Hết từ cần ôn.')).toBeInTheDocument()
    expect(seen).toEqual(['A', 'B', 'A'])
  })
})
