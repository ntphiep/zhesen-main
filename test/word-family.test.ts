import { describe, expect, it } from 'vitest'
import { negates, wordFamilies, type FamilyLink } from '@/lib/dictionary/wordFamily'
import { classifyRelations } from '@/lib/dictionary/relations'
import { relatedTabs } from '@/lib/dictionary/wordPage'

// As Open English WordNet 2025 links them, sense by sense.
const LINKS: FamilyLink[] = [
  { a: 'decide', b: 'decision', kind: 'derivation' },
  { a: 'decide', b: 'decisive', kind: 'derivation' },
  { a: 'decisive', b: 'decisiveness', kind: 'derivation' },
  { a: 'decisively', b: 'decisive', kind: 'pertainym' },
  { a: 'decisive', b: 'indecisive', kind: 'antonym' },
  { a: 'decisive', b: 'conclusive', kind: 'antonym' },
  { a: 'light', b: 'lighter', kind: 'derivation' },
  { a: 'lighter', b: 'barge', kind: 'derivation' },
  { a: 'photic', b: 'light', kind: 'pertainym' },
  { a: 'Decide', b: 'decide', kind: 'derivation' },
]

describe('wordFamilies', () => {
  const families = wordFamilies(LINKS)

  it('gathers the words one link away, then the ones two away that share the stem', () => {
    expect(families.get('decide')).toEqual(['decision', 'decisive', 'decisively', 'indecisive', 'decisiveness'])
  })

  it('takes an antonym only when it is the word with a negative prefix', () => {
    expect(negates('decisive', 'indecisive')).toBe(true)
    expect(negates('decisive', 'conclusive')).toBe(false)
    expect(families.get('decisive')).not.toContain('conclusive')
  })

  it('drops a pertainym of another root and a second link that leaves the stem', () => {
    expect(families.get('light')).toEqual(['lighter'])
  })

  it('leaves out names and caps a family', () => {
    expect([...families.keys()]).not.toContain('Decide')
    const hub = Array.from({ length: 20 }, (_, i): FamilyLink => ({ a: 'act', b: `act${'x'.repeat(i + 1)}`, kind: 'derivation' }))
    expect(wordFamilies(hub, 12).get('act')).toHaveLength(12)
  })
})

describe('the family on the word page', () => {
  it('lists the WordNet family ahead of the stem\'s other derived words', () => {
    const relations = [
      { relationType: 'derived', relatedText: 'decidable', relatedEntryId: null },
      { relationType: 'family', relatedText: 'decision', relatedEntryId: 'en:decision' },
      { relationType: 'family', relatedText: 'decisive', relatedEntryId: 'en:decisive' },
    ]
    expect(classifyRelations(relations).family).toEqual(['decision', 'decisive'])
    const tabs = relatedTabs({ lang: 'en', headword: 'decide', lemma: null, relations, containing: [], kin: [], formTexts: [], previews: {} })
    expect(tabs.find((t) => t.key === 'derived')?.items.map((i) => i.text)).toEqual(['decision', 'decisive', 'decidable'])
  })
})
