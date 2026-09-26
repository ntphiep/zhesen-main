import { describe, it, expect } from 'vitest'
import { posGroup, posGroups, splitPos, joinPos } from '@/lib/dictionary/pos'

describe('posGroup', () => {
  it('groups abbreviated and spelled-out pos values under the same key', () => {
    expect(posGroup('adj')).toEqual({ key: 'adjective', abbr: 'adj.', labelVi: 'Tính từ' })
    expect(posGroup('adjective')).toEqual({ key: 'adjective', abbr: 'adj.', labelVi: 'Tính từ' })
    expect(posGroup('adv')?.key).toBe('adverb')
    expect(posGroup('adverb')?.key).toBe('adverb')
    // The word page's family table showed the raw key for Takeda under take.
    expect(posGroup('proper_noun')).toEqual(posGroup('name'))
  })
  it('returns null for null/empty pos', () => {
    expect(posGroup(null)).toBeNull()
    expect(posGroup('')).toBeNull()
    expect(posGroup('  ')).toBeNull()
  })
  it('falls back to a passthrough group for an unrecognized pos', () => {
    expect(posGroup('gerund')).toEqual({ key: 'gerund', abbr: 'gerund', labelVi: 'gerund' })
  })
  it('gives every group an abbreviation', () => {
    // A category added without one would render an empty cell rather than fail loudly.
    for (const raw of ['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'determiner',
      'preposition', 'conjunction', 'interjection', 'numeral', 'name', 'article',
      'character', 'contraction', 'participle', 'prefix', 'prep_phrase', 'symbol',
      'letter', 'phrase', 'particle']) {
      expect(posGroup(raw)?.abbr, raw).toBeTruthy()
    }
  })
})

describe('splitPos and posGroups', () => {
  it('reads the several parts of speech stored on one word', () => {
    expect(splitPos('noun,verb')).toEqual(['noun', 'verb'])
    expect(splitPos(null)).toEqual([])
    expect(posGroups(splitPos('noun,verb')).map((g) => g.abbr)).toEqual(['n.', 'v.'])
  })
  it('collapses two spellings of one category', () => {
    expect(posGroups(['adj', 'adjective']).map((g) => g.key)).toEqual(['adjective'])
  })
})

describe('joinPos', () => {
  it('puts the most-used part of speech first', () => {
    // en:tentative: sense_order 1 and 2 are noun, 3 to 5 are adjective. The word is an
    // adjective; the noun sense is archaic.
    expect(joinPos(['noun', 'noun', 'adjective', 'adjective', 'adjective']))
      .toBe('adjective,noun')
  })
  it('breaks a tie on where the category first appears', () => {
    expect(joinPos(['verb', 'noun'])).toBe('verb,noun')
  })
  it('is null when no sense carries a part of speech', () => {
    expect(joinPos([null, undefined, ''])).toBeNull()
  })
})
