import { describe, it, expect } from 'vitest'
import {
  THEORY_PATH,
  phonemePath,
  theoryBlockPath,
  theoryLangPath,
  toeicPartPath,
  toeicTopicPath,
  vocabularyLevelPath,
  wordClassPath,
} from '@/lib/theory/path'
import { BLOCKS_BY_LANG, THEORY_BLOCKS, hasBlock } from '@/lib/theory/blocks'

describe('theory paths', () => {
  it('builds the hub and the language hub', () => {
    expect(THEORY_PATH).toBe('/theory')
    expect(theoryLangPath('en')).toBe('/theory/en')
  })

  it('builds a block path from its key', () => {
    expect(theoryBlockPath('en', 'word-class')).toBe('/theory/en/word-class')
    expect(theoryBlockPath('zh', 'vocabulary')).toBe('/theory/zh/vocabulary')
    expect(theoryBlockPath('en', 'toeic')).toBe('/theory/en/toeic')
  })

  it('escapes a level that is not URL safe', () => {
    expect(vocabularyLevelPath('zh', 'HSK 1')).toBe('/theory/zh/vocabulary/HSK%201')
  })

  it('points a part of speech at its own page', () => {
    expect(wordClassPath('en', 'noun')).toBe('/theory/en/word-class/noun')
  })

  it('gives each TOEIC topic and part a page under the block', () => {
    expect(toeicTopicPath('en', 'office')).toBe('/theory/en/toeic/topic/office')
    expect(toeicPartPath('en', 5)).toBe('/theory/en/toeic/part/5')
  })

  it('points a sound at its anchor on the one pronunciation page', () => {
    expect(phonemePath('en', 'iː')).toBe('/theory/en/pronunciation#i%CB%90')
  })
})

describe('blocks by language', () => {
  it('gives English every block', () => {
    expect(BLOCKS_BY_LANG.en.map((b) => b.key)).toEqual(THEORY_BLOCKS.map((b) => b.key))
  })

  it('gives the other two only what the dictionary answers', () => {
    expect(BLOCKS_BY_LANG.zh.map((b) => b.key)).toEqual(['grammar', 'vocabulary'])
    expect(BLOCKS_BY_LANG.es.map((b) => b.key)).toEqual(['grammar', 'vocabulary'])
  })

  it('keeps the learning order of THEORY_BLOCKS', () => {
    expect(THEORY_BLOCKS[0].key).toBe('pronunciation')
    expect(THEORY_BLOCKS[THEORY_BLOCKS.length - 1].key).toBe('vocabulary')
  })

  it('answers hasBlock per language', () => {
    expect(hasBlock('en', 'collocation')).toBe(true)
    expect(hasBlock('zh', 'collocation')).toBe(false)
    expect(hasBlock('en', 'toeic')).toBe(true)
    expect(hasBlock('es', 'toeic')).toBe(false)
  })
})
