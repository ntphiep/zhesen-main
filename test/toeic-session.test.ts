import { describe, it, expect } from 'vitest'
import { parseHistory, parseProgress } from '@/lib/practice/toeic/session'

const good = { at: 1, label: 'Thi thử', correct: 60, total: 100, score: { low: 280, high: 330 } }

describe('parseHistory', () => {
  it('drops only the entry that fails and keeps the others', () => {
    const raw = JSON.stringify({ test01: good, test02: { label: 'Part 5', correct: 'ten' } })
    expect(parseHistory(raw)).toEqual({ test01: good })
  })

  it('reads nothing from missing, broken or non-object storage', () => {
    expect(parseHistory(null)).toEqual({})
    expect(parseHistory('{not json')).toEqual({})
    expect(parseHistory('[1, 2]')).toEqual({})
  })
})

describe('parseProgress', () => {
  it('keeps a valid unfinished session and drops an answer outside A to D', () => {
    const kept = {
      session: { label: 'Thi thử', numbers: [101, 102], timed: true },
      answers: [[101, 2]], flags: [102], left: 4_000_000, current: 102, step: 0,
    }
    const raw = JSON.stringify({ test01: kept, test02: { ...kept, answers: [[101, 4]] } })
    expect(parseProgress(raw)).toEqual({ test01: kept })
  })
})
