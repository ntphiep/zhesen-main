import { describe, it, expect } from 'vitest'
import { theoryContent } from '@/lib/theory/content'
import { posGroup } from '@/lib/dictionary/pos'
import { splitIpa } from '@/lib/theory/ipa'

/** The English blocks are written by hand, so these are the shape rules a page depends
 *  on: an anchor that is unique, a class key a word's own tag can reach, and an example
 *  that carries its meaning. */
const en = theoryContent('en')
if (!en) throw new Error('English theory content is missing')

describe('phonemes', () => {
  it('has a unique symbol per sound, which the anchors depend on', () => {
    const symbols = en.phonemes.map((p) => p.symbol)
    expect(new Set(symbols).size).toBe(symbols.length)
  })

  it('never reuses a British symbol as another sound American spelling', () => {
    const symbols = new Set(en.phonemes.map((p) => p.symbol))
    for (const p of en.phonemes) {
      if (p.gaSymbol) expect(symbols.has(p.gaSymbol)).toBe(false)
    }
  })

  it('gives every sound its group, its keyword, its spellings and its examples', () => {
    for (const p of en.phonemes) {
      expect(p.groupVi.length).toBeGreaterThan(0)
      expect(p.keyword.length).toBeGreaterThan(0)
      expect(p.howVi.length).toBeGreaterThan(0)
      expect(p.spellings.length).toBeGreaterThan(0)
      expect(p.examples.length).toBeGreaterThanOrEqual(2)
      for (const e of p.examples) {
        expect(e.word.length).toBeGreaterThan(0)
        expect(e.ipa).toMatch(/^\/.*\/$/)
      }
    }
  })

  it('tags each example with letters the card itself lists as a spelling', () => {
    for (const p of en.phonemes) {
      for (const e of p.examples) {
        expect(p.spellings).toContain(e.spelling)
      }
    }
  })

  it('transcribes its own examples in sounds the table documents', () => {
    const symbols = en.phonemes.flatMap((p) => (p.gaSymbol ? [p.symbol, p.gaSymbol] : [p.symbol]))
    // Everything outside the set: the slashes, the stress marks and the syllable dot.
    const allowed = new Set(['/', 'ˈ', 'ˌ', '.', '(', ')', '-', ' '])
    const unknown = new Set<string>()
    for (const p of en.phonemes) {
      for (const e of p.examples) {
        for (const t of splitIpa(e.ipa, symbols)) {
          if (t.symbol) continue
          for (const ch of t.text) if (!allowed.has(ch)) unknown.add(ch)
        }
      }
    }
    expect([...unknown]).toEqual([])
  })
})

describe('word classes', () => {
  it('keys every class the way a word is tagged, so the tag can link here', () => {
    for (const c of en.wordClasses) {
      expect(posGroup(c.key)?.key).toBe(c.key)
      expect(posGroup(c.key)?.labelVi).toBe(c.titleVi)
      expect(posGroup(c.key)?.abbr).toBe(c.abbr)
    }
  })

  it('has a unique key per class', () => {
    const keys = en.wordClasses.map((c) => c.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('states a role and at least one mistake for each', () => {
    for (const c of en.wordClasses) {
      expect(c.oneLineVi.length).toBeGreaterThan(0)
      expect(c.roleVi.length).toBeGreaterThan(0)
      expect(c.mistakes.length).toBeGreaterThan(0)
      for (const m of c.mistakes) expect(m.whyVi.length).toBeGreaterThan(0)
    }
  })
})

describe('sentence topics', () => {
  it('has a unique id per topic, which the anchors depend on', () => {
    const ids = en.sentenceTopics.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('translates every example', () => {
    for (const t of en.sentenceTopics) {
      expect(t.items.length).toBeGreaterThan(0)
      for (const item of t.items) {
        expect(item.examples.length).toBeGreaterThan(0)
        for (const e of item.examples) expect(e.vi.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('collocation', () => {
  it('has a unique id per pattern and a head per set', () => {
    const ids = en.collocationPatterns.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    const heads = en.collocationSets.map((s) => s.head)
    expect(new Set(heads).size).toBe(heads.length)
  })

  it('translates every pair', () => {
    for (const s of en.collocationSets) {
      expect(s.items.length).toBeGreaterThan(0)
      for (const i of s.items) expect(i.vi.length).toBeGreaterThan(0)
    }
    for (const p of en.collocationPatterns) {
      expect(p.formula.length).toBeGreaterThan(0)
      for (const e of p.examples) expect(e.vi.length).toBeGreaterThan(0)
    }
  })
})
