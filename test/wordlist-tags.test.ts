import { describe, it, expect } from 'vitest'
import { parseTagsInput, mergeTags, removeTag, tagCounts } from '@/lib/wordlist/tags'
import type { UserWord } from '@/lib/wordlist/types'

function mk(id: string, tags: string[]): UserWord {
  return {
    id, lang: 'en', entryId: null, headword: id, reading: null, ipa: null, pos: null,
    meaningVi: null, meaningEn: null, level: null, example: null, exampleTranslation: null,
    audioUrl: null, notes: null, status: 'new', tags, createdAt: 'x', updatedAt: 'x',
  }
}

describe('parseTagsInput', () => {
  it('trims, drops empties, and dedupes', () => {
    expect(parseTagsInput('du lich, , du lich , cong-viec')).toEqual(['du lich', 'cong-viec'])
  })

  it('returns empty array for blank input', () => {
    expect(parseTagsInput('   ')).toEqual([])
  })

  // The CSV export joins tags with ";" (lib/wordlist/csv.ts), so a tag list copied
  // out of a backup and pasted into the tag box used to arrive as one long tag.
  it('accepts semicolons as separators, the way the CSV export writes them', () => {
    expect(parseTagsInput('animal;pet')).toEqual(['animal', 'pet'])
  })
})

describe('mergeTags', () => {
  it('unions without duplicating existing tags', () => {
    expect(mergeTags(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c'])
  })

  it('is a no-op when nothing new is added', () => {
    expect(mergeTags(['a'], [])).toEqual(['a'])
  })
})

describe('removeTag', () => {
  it('removes only the given tag', () => {
    expect(removeTag(['a', 'b', 'c'], 'b')).toEqual(['a', 'c'])
  })
})

describe('tagCounts', () => {
  it('counts distinct tags across words, sorted by count desc then name', () => {
    const words = [mk('1', ['du lich', 'a1']), mk('2', ['du lich']), mk('3', ['cong viec']), mk('4', [])]
    expect(tagCounts(words)).toEqual([
      { tag: 'du lich', count: 2 },
      { tag: 'a1', count: 1 },
      { tag: 'cong viec', count: 1 },
    ])
  })

  it('is empty for a wordlist with no tags', () => {
    expect(tagCounts([mk('1', [])])).toEqual([])
  })
})
