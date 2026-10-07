import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { gradeWordById } from '@/lib/wordlist/review'
import { appliesToSchedule, MODE_SKILL } from '@/lib/practice/grading'
import type { SrsState } from '@/lib/progress/types'

const NOW = Date.parse('2026-10-05T03:00:00Z') // 10:00 in Hà Nội
const DAY = 86_400_000

const row = (dueAt: string) => ({
  id: 'w1', lang: 'en', headword: 'dog', reading: null, ipa: null,
  meaning_vi: 'con chó', meaning_en: 'dog', example: null, example_translation: null, audio_url: null,
  fsrs_stability: 3, fsrs_difficulty: 5, fsrs_elapsed_days: 1, fsrs_scheduled_days: 3,
  fsrs_learning_steps: 0, fsrs_reps: 2, fsrs_lapses: 0, fsrs_state: 2,
  fsrs_due_at: dueAt, fsrs_last_review_at: '2026-10-02T03:00:00Z',
})

function mockClient(data: unknown, insertError: unknown = null) {
  const select = vi.fn<(cols: string) => unknown>(() => ({ eq: () => ({ maybeSingle: async () => ({ data, error: null }) }) }))
  const update = vi.fn<(patch: Record<string, unknown>) => unknown>(() => ({ eq: async () => ({ error: null }) }))
  const insert = vi.fn<(r: Record<string, unknown>) => unknown>(async () => ({ error: insertError }))
  const from = vi.fn((table: string) => (table === 'review_events' ? { insert } : { select, update }))
  return { client: { from } as unknown as SupabaseClient, select, update, insert }
}

const review = (over: Partial<SrsState> = {}): SrsState => ({
  vocabId: 'w1', stability: 3, difficulty: 5, elapsedDays: 1, scheduledDays: 3, learningSteps: 0,
  reps: 2, lapses: 0, cardState: 'review', dueAt: NOW, lastReviewedAt: NOW - 3 * DAY, ...over,
})

describe('two skills', () => {
  it('maps the choice modes to recognition, the rest to recall', () => {
    expect(MODE_SKILL).toEqual({
      quiz: 'recognition', match: 'recognition', listen: 'recognition', phrase: 'recognition',
      review: 'recall', write: 'recall', dictation: 'recall', speak: 'recall', cloze: 'recall', ipa: 'recall', forms: 'recall',
    })
  })

  it('grades a quiz answer on the recognition columns only and logs it', async () => {
    const { client, select, update, insert } = mockClient(row('2026-10-05T01:00:00Z'))
    const result = await gradeWordById(client, 'w1', 'quiz', 'good', NOW)
    expect(select.mock.calls[0][0]).toContain('fsrs_stability:fsrs_recog_stability')
    expect(update).toHaveBeenCalledTimes(1)
    const patch = update.mock.calls[0][0]
    expect(Object.keys(patch).length).toBe(10)
    expect(Object.keys(patch).every((k) => k.startsWith('fsrs_recog_'))).toBe(true)
    expect(insert).toHaveBeenCalledTimes(1)
    expect(insert.mock.calls[0][0]).toMatchObject({
      word_id: 'w1', skill: 'recognition', mode: 'quiz', rating: 3, applied: true,
      state_before: 2, stability_before: 3, difficulty_before: 5,
    })
    expect(result).toMatchObject({ applied: true, logged: true })
  })

  it('grades a review answer on the recall columns', async () => {
    const { client, select, update, insert } = mockClient(row('2026-10-05T01:00:00Z'))
    await gradeWordById(client, 'w1', 'review', 'good', NOW)
    expect(select.mock.calls[0][0]).not.toContain('fsrs_recog_')
    expect(Object.keys(update.mock.calls[0][0]).every((k) => k.startsWith('fsrs_') && !k.startsWith('fsrs_recog_'))).toBe(true)
    expect(insert.mock.calls[0][0]).toMatchObject({ skill: 'recall', mode: 'review' })
  })

  it('logs a success on a review card not yet due without moving its schedule', async () => {
    const { client, update, insert } = mockClient(row('2026-10-09T03:00:00Z'))
    const result = await gradeWordById(client, 'w1', 'write', 'good', NOW)
    expect(update).not.toHaveBeenCalled()
    expect(insert.mock.calls[0][0]).toMatchObject({ applied: false, mode: 'write', rating: 3 })
    expect(result?.applied).toBe(false)
    expect(result?.next.dueAt).toBe(Date.parse('2026-10-09T03:00:00Z'))
  })

  it('still records a failure on a review card not yet due', async () => {
    const { client, update } = mockClient(row('2026-10-09T03:00:00Z'))
    const result = await gradeWordById(client, 'w1', 'quiz', 'again', NOW)
    expect(update).toHaveBeenCalledTimes(1)
    expect(result?.applied).toBe(true)
  })

  it('moves on when the answer was saved but its log was not', async () => {
    const { client, update } = mockClient(row('2026-10-05T01:00:00Z'), { message: 'offline' })
    const result = await gradeWordById(client, 'w1', 'review', 'good', NOW)
    expect(update).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ applied: true, logged: false })
  })

  // #111: a learner who left before the schedule write returned kept the schedule but lost the log.
  it('sends the log row while the schedule write is still in flight', async () => {
    const { client, update, insert } = mockClient(row('2026-10-05T01:00:00Z'))
    let release: (result: { error: null }) => void = () => {}
    update.mockImplementation(() => ({ eq: () => new Promise<{ error: null }>((r) => { release = r }) }))
    const pending = gradeWordById(client, 'w1', 'review', 'good', NOW)
    await vi.waitFor(() => expect(insert).toHaveBeenCalledTimes(1))
    release({ error: null })
    await expect(pending).resolves.toMatchObject({ applied: true, logged: true })
  })
})

describe('appliesToSchedule', () => {
  it('applies a failure always, and any answer on a card still learning', () => {
    expect(appliesToSchedule(review({ dueAt: NOW + 5 * DAY }), 'again', NOW)).toBe(true)
    expect(appliesToSchedule(review({ cardState: 'new', dueAt: NOW + 5 * DAY }), 'good', NOW)).toBe(true)
    expect(appliesToSchedule(review({ cardState: 'learning', dueAt: NOW + 600_000 }), 'good', NOW)).toBe(true)
    expect(appliesToSchedule(review({ cardState: 'relearning', dueAt: NOW + 600_000 }), 'easy', NOW)).toBe(true)
  })

  it('applies a success on a review card only when it is due by the end of the study day', () => {
    expect(appliesToSchedule(review({ dueAt: Date.parse('2026-10-05T15:00:00Z') }), 'good', NOW)).toBe(true)
    expect(appliesToSchedule(review({ dueAt: Date.parse('2026-10-05T22:00:00Z') }), 'hard', NOW)).toBe(false)
  })
})
