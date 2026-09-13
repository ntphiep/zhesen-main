import { describe, it, expect } from 'vitest'
import { pickSenses, isCleanExample, isClassifierGloss, parseClassifiers, fillPivotVi, cleanMtGloss, isSentenceTranslation, hasUnknownLongWord } from '@/lib/dictionary/textQuality'
import { tokenize } from '@/lib/reader/tokenize'
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
  it('surfaces Vietnamese-bearing senses ahead of English-only ones for a VN learner', () => {
    const senses = [sense(1, null), sense(2, null), sense(5, 'có-vi')]
    const { shown } = pickSenses(senses, 1)
    expect(shown[0].glossVi).toBe('có-vi')
  })
  it('returns all and hiddenCount 0 when under the cap', () => {
    const { shown, hiddenCount } = pickSenses([sense(1, 'a')], 3)
    expect(shown).toHaveLength(1)
    expect(hiddenCount).toBe(0)
  })
  it('treats a pivot-derived Vietnamese gloss as Vietnamese for ordering', () => {
    const withPivot: DictSense = { pos: 'n', glossVi: null, glossEn: 'en', senseOrder: 9, pivotVi: 'qua-en' }
    const { shown } = pickSenses([sense(1, null), withPivot], 1)
    expect(shown[0].pivotVi).toBe('qua-en')
  })
})

describe('cleanMtGloss', () => {
  it('strips the trailing "Name" NER artifact from proper-noun glosses', () => {
    expect(cleanMtGloss('Trung QuốcName')).toBe('Trung Quốc')
    expect(cleanMtGloss('Việt NamName')).toBe('Việt Nam')
    expect(cleanMtGloss('MạngName')).toBe('Mạng')
    expect(cleanMtGloss('net; MạngName')).toBe('net; Mạng')
  })
  it('drops a still-garbled gloss so the caller can fall back', () => {
    expect(cleanMtGloss('Th3Ethiopian month 11-LongNamePossessive; ~ (hạt thuộc sở hữu)')).toBeNull()
  })
  it('leaves a clean Vietnamese gloss untouched', () => {
    expect(cleanMtGloss('học, nghiên cứu')).toBe('học, nghiên cứu')
    expect(cleanMtGloss('con chó')).toBe('con chó')
    expect(cleanMtGloss(null)).toBeNull()
  })
})

describe('fillPivotVi', () => {
  const s = (glossVi: string | null, glossEn: string | null): DictSense =>
    ({ pos: 'n', glossVi, glossEn, senseOrder: 1 })
  it('attaches a Vietnamese gloss from the English pivot only where one is missing', () => {
    const map = new Map([['study', 'học, nghiên cứu'], ['dog', 'con chó']])
    const out = fillPivotVi([s(null, 'to study'), s('đã có', 'x'), s(null, 'cat')], map)
    expect(out[0].pivotVi).toBe('học, nghiên cứu') // "to study" -> study -> Vietnamese
    expect(out[1].pivotVi).toBeUndefined()          // already has glossVi, untouched
    expect(out[2].pivotVi).toBeUndefined()          // "cat" not in the pivot map
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
  it('rejects a merged run of common words even when each piece is short', () => {
    expect(isCleanExample('Ilastsawher in January.')).toBe(false)
    expect(isCleanExample('Thehatwasblueandred.')).toBe(false)
  })
  it('keeps legitimate long words and compounds', () => {
    expect(isCleanExample('The development of the economy was rapid.')).toBe(true)
    expect(isCleanExample('My grandmother lives near the lake.')).toBe(true)
    expect(isCleanExample('International cooperation is important.')).toBe(true)
    expect(isCleanExample('We did it together that afternoon.')).toBe(true)
  })
  it('treats empty as not clean', () => {
    expect(isCleanExample('')).toBe(false)
  })
})

describe('classifiers (Chinese CL: glosses)', () => {
  it('flags CC-CEDICT classifier glosses', () => {
    expect(isClassifierGloss('CL:个[ge4]')).toBe(true)
    expect(isClassifierGloss('dog')).toBe(false)
    expect(isClassifierGloss(null)).toBe(false)
  })
  it('extracts the simplified classifier characters, dropping pinyin', () => {
    expect(parseClassifiers('CL:隻|只[zhi1],條|条[tiao2]')).toEqual(['只', '条'])
    expect(parseClassifiers('CL:个[ge4]')).toEqual(['个'])
    expect(parseClassifiers('dog')).toEqual([])
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
  // The contract changed on 2026-09-12: it used to return bare strings and the page
  // rendered them as identical chips, which is what made a dialect spelling
  // indistinguishable from a past participle. It now names each form.
  it('dedupes forms, keeping the first label seen for a repeated spelling', () => {
    const forms = groupWordForms([
      { formText: 'drinks', formLabel: 'plural' },
      { formText: 'drinking', formLabel: 'present participle' },
      { formText: 'drank', formLabel: 'past' },
      { formText: 'drinks', formLabel: 'third-person singular' },
    ])
    expect(forms.map((f) => f.text)).toEqual(['drinking', 'drank', 'drinks'])
    expect(forms.find((f) => f.text === 'drinks')?.label).toBe('Số nhiều')
  })

  it('names each form in Vietnamese and carries its usage markers', () => {
    const forms = groupWordForms([{ formText: 'smeeth', formLabel: 'alternative dialectal rare' }])
    expect(forms[0]).toMatchObject({ label: 'Biến thể', markers: ['hiếm', 'phương ngữ'], standard: false })
  })

  it('drops the Spanish clitic-attached forms, which the conjugation table covers', () => {
    const forms = groupWordForms([
      { formText: 'dígamelo', formLabel: 'accusative combined-form formal imperative object-singular' },
      { formText: 'gatos', formLabel: 'plural' },
    ])
    expect(forms.map((f) => f.text)).toEqual(['gatos'])
  })
})

describe('isSentenceTranslation', () => {
  it('rejects the entry gloss copied into the translation field', () => {
    expect(isSentenceTranslation('con chó', ['con chó', 'chó'])).toBe(false)
  })
  it('ignores case and surrounding space when comparing', () => {
    expect(isSentenceTranslation('  Con Chó ', ['con chó'])).toBe(false)
  })
  it('keeps a real translation of the sentence', () => {
    expect(isSentenceTranslation('Con chó sủa.', ['con chó'])).toBe(true)
  })
  it('treats a missing translation as nothing to show', () => {
    expect(isSentenceTranslation(null, ['con chó'])).toBe(false)
    expect(isSentenceTranslation('   ', ['con chó'])).toBe(false)
  })
})

describe('hasUnknownLongWord', () => {
  // The word list behind isCleanExample cannot catch these: "holy" and "ground" are
  // ordinary English words that simply are not on it. The dictionary knows better.
  const known = new Set(['the', 'a', 'dog', 'barked', 'development', 'economy', 'holy'])

  it('flags a run-together token the dictionary does not know', () => {
    expect(hasUnknownLongWord(tokenize('en', 'holyground.'), known)).toBe(true)
  })
  it('passes a sentence whose long words are all in the dictionary', () => {
    expect(hasUnknownLongWord(tokenize('en', 'The development of the economy.'), known)).toBe(false)
  })
  it('leaves short unknown tokens alone, since a missing headword is the likelier cause', () => {
    expect(hasUnknownLongWord(tokenize('en', 'The cat sat.'), known)).toBe(false)
  })
  it('ignores non-Latin text, where an unresolved token is an ordinary character', () => {
    expect(hasUnknownLongWord(tokenize('zh', '我有一本很好看的中文书'), new Set())).toBe(false)
  })
})
