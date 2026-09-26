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

describe('toeic', () => {
  const t = en.toeic

  it('lists the seven parts in test order, 100 questions per section', () => {
    expect(t.parts.map((p) => p.number)).toEqual([1, 2, 3, 4, 5, 6, 7])
    const count = (s: string) => t.parts.filter((p) => p.section === s).reduce((n, p) => n + p.questions, 0)
    expect(count('listening')).toBe(100)
    expect(count('reading')).toBe(100)
  })

  it('gives every part its tips and traps', () => {
    for (const p of t.parts) {
      expect(p.tips.length).toBeGreaterThan(0)
      expect(p.traps.length).toBeGreaterThan(0)
    }
  })

  it('holds one Part 5 set, as long as the part itself, as the copy promises', () => {
    expect(t.practice.length).toBe(t.parts.find((p) => p.number === 5)?.questions)
  })

  it('prints one gap and four distinct options per practice item', () => {
    const ids = t.practice.map((q) => q.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const q of t.practice) {
      expect(q.sentence.split('-------').length).toBe(2)
      expect(new Set(q.options).size).toBe(4)
      expect(q.answer).toBeGreaterThanOrEqual(0)
      expect(q.answer).toBeLessThan(4)
      expect(q.whyVi.length).toBeGreaterThan(0)
      expect(q.vi.length).toBeGreaterThan(0)
    }
  })

  it('lists each word once, so each links to one entry', () => {
    const words = t.wordTopics.flatMap((topic) => topic.words.map((w) => w.word))
    expect(new Set(words).size).toBe(words.length)
    for (const topic of t.wordTopics) for (const w of topic.words) expect(w.vi.length).toBeGreaterThan(0)
  })

  it('keys each grammar link the way lex.grammar_points does', () => {
    for (const g of t.grammar) if (g.grammarKey) expect(g.grammarKey).toMatch(/^(a1|a2|b1|b2|c1|c2):[a-z0-9-]+$/)
  })

  it('has a unique anchor per note and never reuses a fixed section anchor', () => {
    const ids = [t.scoring.id, ...t.notes.map((n) => n.id)]
    expect(new Set(ids).size).toBe(ids.length)
    for (const fixed of ['format', 'listening', 'reading', 'grammar', 'paraphrase', 'words', 'practice', 'links']) {
      expect(ids).not.toContain(fixed)
    }
  })

  it('links only to https pages', () => {
    for (const l of t.links) expect(l.url).toMatch(/^https:\/\//)
  })
})
