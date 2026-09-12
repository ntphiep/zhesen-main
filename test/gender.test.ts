import { describe, it, expect } from 'vitest'
import { genderLabel, genderFromCode } from '@/lib/dictionary/gender'

describe('genderFromCode', () => {
  it('names the two Spanish genders in Vietnamese', () => {
    expect(genderFromCode('m')).toBe('giống đực')
    expect(genderFromCode('f')).toBe('giống cái')
    expect(genderFromCode('masculine')).toBe('giống đực')
  })
  it('handles a word that carries both', () => {
    expect(genderFromCode('mf')).toBe('giống đực/cái')
  })
  it('returns null for a language that has no gender', () => {
    expect(genderFromCode(null)).toBeNull()
    expect(genderFromCode('')).toBeNull()
    expect(genderFromCode('n')).toBeNull()
  })
})

describe('genderLabel', () => {
  it('reads the gender out of an entry attributes bag', () => {
    expect(genderLabel({ gender: 'f', frequency: 0.0003 })).toBe('giống cái')
  })
  it('returns null when the entry carries no gender', () => {
    // 4,233 of the 11,312 Spanish entries have none, and no English or Chinese
    // entry has one at all.
    expect(genderLabel({ pinyin: 'gǒu' })).toBeNull()
    expect(genderLabel(null)).toBeNull()
    expect(genderLabel(undefined)).toBeNull()
  })
})
