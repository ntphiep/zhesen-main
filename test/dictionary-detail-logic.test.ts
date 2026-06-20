import { describe, it, expect } from 'vitest'
import { pickSenses, isCleanExample } from '@/lib/dictionary/search'
import { classifyRelations } from '@/lib/dictionary/relations'
import { groupWordForms } from '@/lib/dictionary/family'
import type { DictSense, DictRelation } from '@/lib/dictionary/types'

const sense = (senseOrder: number, glossVi: string | null, pos = 'noun'): DictSense =>
  ({ pos, glossVi, glossEn: 'en', senseOrder })

describe('pickSenses', () => {
  it('keeps the lowest sense_order senses, capped, and reports the hidden count', () => {
    const senses = [sense(3, 'c'), sense(1, 'a'), sense(2, 'b'), sense(4, 'd')]
    const { shown, hiddenCount } = pickSenses(senses, 2)
    expect(shown.map((s) => s.glossVi)).toEqual(['a', 'b'])
    expect(hiddenCount).toBe(2)
  })
  it('prefers senses with a Vietnamese gloss as a tiebreaker within the cap', () => {
    const senses = [sense(1, null), sense(1, 'has-vi'), sense(2, 'b')]
    const { shown } = pickSenses(senses, 2)
    expect(shown.some((s) => s.glossVi === 'has-vi')).toBe(true)
  })
  it('returns all and hiddenCount 0 when under the cap', () => {
    const { shown, hiddenCount } = pickSenses([sense(1, 'a')], 3)
    expect(shown).toHaveLength(1)
    expect(hiddenCount).toBe(0)
  })
})

describe('isCleanExample', () => {
  it('accepts normal sentences', () => {
    expect(isCleanExample('He left.')).toBe(true)
    expect(isCleanExample("It's not far.")).toBe(true)
    expect(isCleanExample('How far is it?')).toBe(true)
  })
  it('rejects run-together text (camelCase boundary or very long token)', () => {
    expect(isCleanExample('WhenIspoketo John, he told me he had seen you.')).toBe(false)
    expect(isCleanExample('She was a farbetterswimmerthan herfriend.')).toBe(false)
  })
  it('treats empty as not clean', () => {
    expect(isCleanExample('')).toBe(false)
  })
})

describe('classifyRelations', () => {
  it('splits derived rows into single-word derived vs multiword compounds, keeps syn/ant/related', () => {
    const rels: DictRelation[] = [
      { relationType: 'derived', relatedText: 'antidevelopment', relatedEntryId: null },
      { relationType: 'derived', relatedText: 'business development', relatedEntryId: null },
      { relationType: 'derived', relatedText: 'web development', relatedEntryId: null },
      { relationType: 'synonym', relatedText: 'growth', relatedEntryId: null },
      { relationType: 'antonym', relatedText: 'decline', relatedEntryId: null },
      { relationType: 'related', relatedText: 'progress', relatedEntryId: null },
    ]
    const c = classifyRelations(rels)
    expect(c.derived).toEqual(['antidevelopment'])
    expect(c.compounds).toEqual(['business development', 'web development'])
    expect(c.synonyms).toEqual(['growth'])
    expect(c.antonyms).toEqual(['decline'])
    expect(c.related).toEqual(['progress'])
  })
  it('dedupes and ignores empty text', () => {
    const c = classifyRelations([
      { relationType: 'derived', relatedText: 'redevelop', relatedEntryId: null },
      { relationType: 'derived', relatedText: 'redevelop', relatedEntryId: null },
      { relationType: 'derived', relatedText: null, relatedEntryId: null },
    ])
    expect(c.derived).toEqual(['redevelop'])
  })
})

describe('groupWordForms', () => {
  it('dedupes inflected forms preserving first-seen order', () => {
    const forms = groupWordForms([
      { formText: 'drinks', formLabel: 'plural' },
      { formText: 'drinking', formLabel: 'present participle' },
      { formText: 'drank', formLabel: 'past' },
      { formText: 'drinks', formLabel: 'third-person singular' },
    ])
    expect(forms).toEqual(['drinks', 'drinking', 'drank'])
  })
})
