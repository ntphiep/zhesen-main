import { describe, it, expect } from 'vitest'
import { posGroup } from '@/lib/dictionary/pos'

describe('posGroup', () => {
  it('groups abbreviated and spelled-out pos values under the same key', () => {
    expect(posGroup('adj')).toEqual({ key: 'adjective', labelVi: 'Tính từ', labelEn: 'Adjective' })
    expect(posGroup('adjective')).toEqual({ key: 'adjective', labelVi: 'Tính từ', labelEn: 'Adjective' })
    expect(posGroup('adv')?.key).toBe('adverb')
    expect(posGroup('adverb')?.key).toBe('adverb')
  })
  it('returns null for null/empty pos', () => {
    expect(posGroup(null)).toBeNull()
    expect(posGroup('')).toBeNull()
    expect(posGroup('  ')).toBeNull()
  })
  it('falls back to a passthrough group for an unrecognized pos', () => {
    expect(posGroup('gerund')).toEqual({ key: 'gerund', labelVi: 'gerund', labelEn: 'Gerund' })
  })
})
