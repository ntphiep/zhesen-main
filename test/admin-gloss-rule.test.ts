import { describe, it, expect } from 'vitest'
import { GLOSS_TERM_MAX, glossWarning } from '@/lib/admin/content'

// The same cut `lex.gloss_terms_reload` makes: `length(s.gloss_vi) <= 80`
// (supabase/migrations/0055_gloss_terms_skip_proper_nouns.sql).
describe('glossWarning', () => {
  it('says nothing at exactly the limit', () => {
    expect(GLOSS_TERM_MAX).toBe(80)
    expect(glossWarning('a'.repeat(80))).toBeNull()
  })

  it('warns one character over, naming the length', () => {
    expect(glossWarning('a'.repeat(81))).toMatch(/81 ký tự, quá 80/)
  })

  it('ignores surrounding space, which the save trims', () => {
    expect(glossWarning(`  ${'a'.repeat(80)}  `)).toBeNull()
  })

  it('counts characters as Postgres does, not UTF-16 units', () => {
    // 𠀀 is one character and two UTF-16 units.
    expect(glossWarning('𠀀'.repeat(80))).toBeNull()
  })

  it('counts a Vietnamese gloss by its letters', () => {
    const gloss = 'xin chào, lời chào khi gặp mặt'
    expect(glossWarning(gloss)).toBeNull()
  })
})
