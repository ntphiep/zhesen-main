import { describe, it, expect } from 'vitest'
import { gradeFromOutcome, gradeForMode, REPORTS_FAILURES } from '@/lib/practice/grading'

describe('gradeFromOutcome', () => {
  it('counts a right answer as a normal recall', () => {
    expect(gradeFromOutcome({ correct: true })).toBe('good')
  })

  it('counts a near miss as a hard one rather than a clean one', () => {
    expect(gradeFromOutcome({ correct: true, nearly: true })).toBe('hard')
  })

  it('counts a wrong answer as forgotten', () => {
    expect(gradeFromOutcome({ correct: false })).toBe('again')
  })

  it('ignores `nearly` on a wrong answer', () => {
    expect(gradeFromOutcome({ correct: false, nearly: true })).toBe('again')
  })

  it('counts a recall the learner called effortless as easy', () => {
    expect(gradeFromOutcome({ correct: true, easy: true })).toBe('easy')
  })

  it('ignores `easy` on a wrong answer', () => {
    expect(gradeFromOutcome({ correct: false, easy: true })).toBe('again')
  })
})

describe('gradeForMode', () => {
  it('records a success from every mode', () => {
    for (const mode of ['quiz', 'write', 'dictation', 'match', 'speak'] as const) {
      expect(gradeForMode(mode, { correct: true })).toBe('good')
    }
  })

  it('records a failure from the modes whose failures mean something', () => {
    for (const mode of ['quiz', 'write', 'dictation', 'match'] as const) {
      expect(gradeForMode(mode, { correct: false })).toBe('again')
    }
  })

  it('records a forgotten word from the self-graded review', () => {
    expect(gradeForMode('review', { correct: false })).toBe('again')
    expect(gradeForMode('review', { correct: true, easy: true })).toBe('easy')
  })

  it('stays quiet when the speaking drill fails', () => {
    // A noisy room or a refused microphone would otherwise reset the card's
    // stability and add a lapse, and nothing on screen would explain why.
    expect(gradeForMode('speak', { correct: false })).toBeNull()
  })

  it('lists every mode, so a new one cannot silently default to trusting itself', () => {
    expect(Object.keys(REPORTS_FAILURES).sort()).toEqual(['cloze', 'dictation', 'forms', 'ipa', 'listen', 'match', 'phrase', 'quiz', 'review', 'speak', 'write'])
  })
})
