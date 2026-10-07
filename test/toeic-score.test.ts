import { describe, it, expect } from 'vitest'
import { estimateReading, summarize, TYPE_LABELS, QUESTION_TYPES } from '@/lib/practice/toeic/score'

describe('estimateReading', () => {
  it.each([
    [0, 5, 30],
    [10, 5, 50],
    [50, 205, 255],
    [70, 315, 365],
    [100, 470, 495],
  ])('puts %i correct at %i to %i on the anchors', (correct, low, high) => {
    expect(estimateReading(correct)).toEqual({ low, high })
  })

  it('runs linearly between anchors and rounds to 5', () => {
    // 75 is halfway from 340 to 390.
    expect(estimateReading(75)).toEqual({ low: 340, high: 390 })
    // 33 is 120 + 0.3 * 55 = 136.5, rounded to 135.
    expect(estimateReading(33)).toEqual({ low: 110, high: 160 })
  })

  it('clamps a count outside 0 to 100', () => {
    expect(estimateReading(-3)).toEqual(estimateReading(0))
    expect(estimateReading(140)).toEqual(estimateReading(100))
  })
})

describe('summarize', () => {
  it('counts per part and lists the weakest type first', () => {
    const sum = summarize([
      { part: 7, type: 'detail', correct: true },
      { part: 7, type: 'detail', correct: true },
      { part: 5, type: 'word-form', correct: false },
      { part: 5, type: 'word-form', correct: true },
      { part: 6, type: 'transition', correct: false },
    ])
    expect(sum.total).toEqual({ correct: 3, total: 5 })
    expect(sum.parts).toEqual([
      { part: 5, correct: 1, total: 2 },
      { part: 6, correct: 0, total: 1 },
      { part: 7, correct: 2, total: 2 },
    ])
    expect(sum.types.map((t) => t.label)).toEqual(['Từ nối', 'Từ loại', 'Chi tiết'])
  })

  it('names every question type in Vietnamese', () => {
    for (const type of QUESTION_TYPES) expect(TYPE_LABELS[type]).toMatch(/\S/)
  })
})
