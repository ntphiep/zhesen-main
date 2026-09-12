import { describe, it, expect } from 'vitest'
import { buildMatchTiles, type MatchWord } from '@/lib/practice/match'

const w = (id: string, headword: string, meaningVi: string | null): MatchWord => ({ id, headword, meaningVi })
const words = [
  w('1', 'dog', 'con chó'), w('2', 'cat', 'con mèo'), w('3', 'water', 'nước'),
  w('4', 'fire', 'lửa'), w('5', 'tree', 'cái cây'),
]

describe('buildMatchTiles', () => {
  it('produces a word tile and a meaning tile per chosen word', () => {
    const tiles = buildMatchTiles(words, 3, () => 0)
    expect(tiles).toHaveLength(6)
    const ids = [...new Set(tiles.map((t) => t.wordId))]
    expect(ids).toHaveLength(3)
    for (const id of ids) {
      const forWord = tiles.filter((t) => t.wordId === id)
      expect(forWord.map((t) => t.kind).sort()).toEqual(['meaning', 'word'])
    }
  })

  it('uses the headword on the word tile and the meaning on the meaning tile', () => {
    const tiles = buildMatchTiles([w('1', 'dog', 'con chó')], 5, () => 0)
    expect(tiles.find((t) => t.kind === 'word')!.text).toBe('dog')
    expect(tiles.find((t) => t.kind === 'meaning')!.text).toBe('con chó')
  })

  it('skips words without a meaning and caps at the available count', () => {
    const tiles = buildMatchTiles([...words, w('6', 'zzz', null)], 99, () => 0)
    expect(tiles).toHaveLength(10) // 5 usable words x 2 tiles
    expect(tiles.some((t) => t.wordId === '6')).toBe(false)
  })
})
