import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ReviewCard } from '@/lib/wordlist/review'
import type { Grade, SrsState } from '@/lib/progress/types'
import { SETTLE_MS } from '@/lib/hooks/useKeyGate'

const m = vi.hoisted(() => ({
  gradeWordById: vi.fn(),
  logDay: vi.fn(),
}))
vi.mock('@/lib/wordlist/review', () => ({ gradeWordById: m.gradeWordById }))
vi.mock('@/lib/hooks/useGradeSync', () => ({ useGradeSync: () => ({ record: vi.fn(), logDay: m.logDay, failed: false }) }))

import { HomeReviewDeck } from '@/components/home/HomeReviewDeck'

const NOW = Date.parse('2026-09-29T03:00:00.000Z')
const DAY = 86_400_000
const state = (id: string, over: Partial<SrsState> = {}): SrsState => ({
  vocabId: id, stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, learningSteps: 0,
  reps: 0, lapses: 0, cardState: 'new', dueAt: NOW - DAY, lastReviewedAt: null, ...over,
})
const card = (id: string): ReviewCard => ({
  id, lang: 'en', headword: id, reading: null, ipa: null, meaningVi: `nghĩa ${id}`, meaningEn: null,
  example: null, exampleTranslation: null, audioUrl: null, entryId: null, state: state(id),
})
const supabase = {} as SupabaseClient

function renderDeck(cards: ReviewCard[], onGraded = vi.fn()) {
  render(<HomeReviewDeck cards={cards} supabase={supabase} now={NOW} total={cards.length} onGraded={onGraded} />)
  return onGraded
}

async function reveal() {
  await userEvent.click(await screen.findByRole('button', { name: 'Hiện nghĩa' }))
}

const onTop = () => screen.getByRole('article', { name: 'Từ đang ôn' }).querySelector('[lang="en"]')?.textContent

beforeEach(() => {
  m.gradeWordById.mockReset()
  m.logDay.mockReset()
  m.gradeWordById.mockImplementation(async (_s: unknown, id: string, grade: Grade) =>
    state(id, { reps: 1, dueAt: NOW + (grade === 'easy' ? 8 : 1) * DAY }))
})

describe('HomeReviewDeck', () => {
  it('grades Dễ as easy through the practice path and reports the new schedule', async () => {
    const onGraded = renderDeck([card('dog'), card('cat')])
    await reveal()
    await userEvent.click(screen.getByRole('button', { name: 'Dễ' }))
    expect(m.gradeWordById).toHaveBeenCalledWith(supabase, 'dog', 'easy')
    await waitFor(() => expect(onTop()).toBe('cat'))
    expect(onGraded).toHaveBeenCalledWith('dog', expect.objectContaining({ reps: 1, dueAt: NOW + 8 * DAY }), false)
  })

  it('sends a word graded Lại to the end of the session', async () => {
    const onGraded = renderDeck([card('dog'), card('cat')])
    await reveal()
    await userEvent.click(screen.getByRole('button', { name: 'Lại' }))
    expect(m.gradeWordById).toHaveBeenCalledWith(supabase, 'dog', 'again')
    // Said to the page too, so the deck holds it again after a layout switch remounts it.
    await waitFor(() => expect(onGraded).toHaveBeenCalledWith('dog', expect.objectContaining({ reps: 1 }), true))
    await waitFor(() => expect(onTop()).toBe('cat'))
    await reveal()
    await userEvent.click(screen.getByRole('button', { name: 'Tốt' }))
    await waitFor(() => expect(onTop()).toBe('dog'))
  })

  it('grades once when the button is pressed twice in a row', async () => {
    let finish: (s: SrsState) => void = () => {}
    m.gradeWordById.mockImplementation(() => new Promise<SrsState>((ok) => { finish = ok }))
    renderDeck([card('dog'), card('cat')])
    await reveal()
    const good = screen.getByRole('button', { name: 'Tốt' })
    await userEvent.dblClick(good)
    finish(state('dog', { reps: 1, dueAt: NOW + DAY }))
    await waitFor(() => expect(onTop()).toBe('cat'))
    expect(m.gradeWordById).toHaveBeenCalledTimes(1)
  })

  it('marks today as studied once, on the first grade', async () => {
    renderDeck([card('dog'), card('cat')])
    await reveal()
    await userEvent.click(screen.getByRole('button', { name: 'Tốt' }))
    await waitFor(() => expect(onTop()).toBe('cat'))
    await reveal()
    await userEvent.click(screen.getByRole('button', { name: 'Khó' }))
    await screen.findByText('Hết từ cần ôn.')
    expect(m.logDay).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Đã ôn 2 từ trong phiên này.')).toBeInTheDocument()
  })

  it('keeps the word on screen when the write fails', async () => {
    m.gradeWordById.mockRejectedValue(new Error('offline'))
    renderDeck([card('dog')])
    await reveal()
    await userEvent.click(screen.getByRole('button', { name: 'Tốt' }))
    expect(await screen.findByText('Chưa lưu được kết quả. Thử lại.')).toBeInTheDocument()
    expect(onTop()).toBe('dog')
    expect(m.logDay).not.toHaveBeenCalled()
  })
})

// A held Enter on /practice/review once revealed and graded every card unseen; the deck
// focuses Tốt on reveal and the reveal button after each grade, so it needs the same gate.
describe('HomeReviewDeck under the keyboard', () => {
  const settle = () => new Promise((r) => setTimeout(r, SETTLE_MS + 50))

  it('ignores Enter on a meaning shown a moment ago', async () => {
    const user = userEvent.setup()
    renderDeck([card('dog')])
    await user.click(await screen.findByRole('button', { name: 'Hiện nghĩa' }))
    expect(screen.getByRole('button', { name: 'Tốt' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(m.gradeWordById).not.toHaveBeenCalled()
  })

  it('grades the card on screen once under a held Enter and leaves the next one unrevealed', async () => {
    const user = userEvent.setup()
    renderDeck([card('dog'), card('cat'), card('sun')])
    await user.click(await screen.findByRole('button', { name: 'Hiện nghĩa' }))
    await settle()
    await user.keyboard('{Enter>8}')
    await waitFor(() => expect(onTop()).toBe('cat'))
    expect(m.gradeWordById).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Hiện nghĩa' })).toBeInTheDocument()
    await user.keyboard('{/Enter}')
  })

  it('grades with Enter once the key is up and the meaning has settled', async () => {
    const user = userEvent.setup()
    renderDeck([card('dog')])
    await user.click(await screen.findByRole('button', { name: 'Hiện nghĩa' }))
    await settle()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(m.gradeWordById).toHaveBeenCalledTimes(1))
  })
})
