import { describe, it, expect } from 'vitest'
import { shuffle } from '@/lib/practice/shuffle'

describe('shuffle', () => {
  it('returns a permutation and leaves the input alone', () => {
    const input = ['a', 'b', 'c', 'd', 'e']
    const out = shuffle(input, () => 0.5)
    expect([...out].sort()).toEqual([...input].sort())
    expect(input).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('is deterministic for a given rand', () => {
    const seq = [0.1, 0.9, 0.4, 0.7]
    const rand = () => seq[i++ % seq.length]
    let i = 0
    const first = shuffle([1, 2, 3, 4, 5], rand)
    i = 0
    expect(shuffle([1, 2, 3, 4, 5], rand)).toEqual(first)
  })

  // rand() returning its maximum must still land inside the array: Math.floor of
  // rand * (i + 1) has to stay <= i, which is what makes Fisher-Yates unbiased
  // rather than an out-of-range swap with undefined.
  it('stays in range at the top of rand', () => {
    const out = shuffle([1, 2, 3], () => 0.999999)
    expect(out).toHaveLength(3)
    expect(out.every((n) => n !== undefined)).toBe(true)
    expect([...out].sort()).toEqual([1, 2, 3])
  })

  it('handles empty and single-element lists', () => {
    expect(shuffle([])).toEqual([])
    expect(shuffle(['only'])).toEqual(['only'])
  })
})
