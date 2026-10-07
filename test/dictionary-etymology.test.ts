import { describe, it, expect } from 'vitest'
import {
  etymologyProse, homophonesOf, langNameOf, leadForms, originOf, parseTerm, phonemicForms, senseGrammar, standardForms, syllablesOf,
  type KaikkiTemplate,
} from '@/lib/dictionary/etymology'

// Templates as the kaikki English extract carries them, cut to the ones the build reads.
const DICTIONARY: KaikkiTemplate[] = [
  { name: 'ety', args: { 1: 'en', id: 'work', 2: ':inh', 3: 'enm:dixionare<id:dictionary>', 4: ':afeq', 5: 'diction', 6: '-ary', tree: '1' }, expansion: 'Etymology tree' },
  { name: 'inh', args: { 1: 'en', 2: 'enm', 3: 'dixionare' }, expansion: 'Middle English dixionare' },
  { name: 'der', args: { 1: 'en', 2: 'la-med', 3: 'dictiōnārium' }, expansion: 'Medieval Latin dictiōnārium' },
  { name: 'der', args: { 1: 'en', 2: 'la', 3: 'dictiōnārius' }, expansion: 'Latin dictiōnārius' },
  { name: 'surf', args: { 1: 'en', 2: 'diction', 3: '-ary' }, expansion: 'By surface analysis, diction + -ary' },
]

describe('parseTerm', () => {
  it('reads the language, the word and its modifiers', () => {
    expect(parseTerm('enm:dixionare<id:dictionary>')).toEqual({ lang: 'enm', word: 'dixionare', mods: { id: 'dictionary' } })
    expect(parseTerm('porter<alt:porte><t:he carries>')).toEqual({ lang: null, word: 'porter', mods: { alt: 'porte', t: 'he carries' } })
  })

  it('keeps a nested etymology whole', () => {
    expect(parseTerm('enm:booken<ety:inh<ang:bōcian>>').mods.ety).toBe('inh<ang:bōcian>')
  })

  it('keeps the first of several spellings', () => {
    expect(parseTerm('nighte,night,nyght,niȝt').word).toBe('nighte')
    expect(parseTerm('creime, creme').word).toBe('creime')
  })
})

describe('originOf', () => {
  it('reads dictionary as a chain of three ancestors and its English parts', () => {
    expect(originOf('dictionary', DICTIONARY, '', ['noun'])).toEqual({
      pos: ['noun'],
      chain: [
        { rel: 'inh', lang: 'enm', word: 'dixionare' },
        { rel: 'der', lang: 'la-med', word: 'dictiōnārium' },
        { rel: 'der', lang: 'la', word: 'dictiōnārius' },
      ],
      parts: [{ word: 'diction' }, { word: '-ary' }],
    })
  })

  it('takes the gloss from the fifth argument and the reading from the expansion', () => {
    const o = originOf('encyclopedia', [
      { name: 'der', args: { 1: 'en', 2: 'grc', 3: 'ἐγκύκλιος', 4: '', 5: 'circular' }, expansion: 'Ancient Greek ἐγκύκλιος (enkúklios, “circular”)' },
    ], '', ['noun'])
    expect(o?.chain).toEqual([{ rel: 'der', lang: 'grc', word: 'ἐγκύκλιος', gloss: 'circular', tr: 'enkúklios' }])
  })

  it('reads a gloss as plain text', () => {
    const o = originOf('kike', [
      { name: 'der', args: { 1: 'en', 2: 'yi', 3: 'keek', t: 'to <i class="Latn mention" lang="en">peek</i> surreptitiously' }, expansion: '' },
      { name: 'der', args: { 1: 'en', 2: 'ja', 3: 'gaijin', t: 'foreigner, outsider” < “non-relative' }, expansion: '' },
    ], '', ['noun'])
    expect(o?.chain.map((s) => s.gloss)).toEqual(['to peek surreptitiously', 'foreigner, outsider'])
  })

  it('follows a chain written only in the new syntax', () => {
    const o = originOf('book', [
      { name: 'ety', args: { 1: 'en', 2: ':inh', 3: 'enm:booken<ety:inh<ang:bōcian>>' }, expansion: '' },
    ], '', ['verb'])
    expect(o?.chain.map((s) => [s.rel, s.lang, s.word])).toEqual([['inh', 'enm', 'booken'], ['inh', 'ang', 'bōcian']])
  })

  it('reads parts from an ety template that carries no chain', () => {
    const o = originOf('happiness', [
      { name: 'ety', args: { 1: 'en', 2: ':af', 3: 'happy', 4: '-ness', text: '+', tree: '1' }, expansion: 'From happy + -ness.' },
    ], 'From happy + -ness.', ['noun'])
    expect(o).toEqual({ pos: ['noun'], chain: [], parts: [{ word: 'happy' }, { word: '-ness' }] })
  })

  it('adds the hyphen a suffix template leaves out', () => {
    const o = originOf('kindness', [{ name: 'suffix', args: { 1: 'en', 2: 'kind', 3: 'ness' }, expansion: 'kind + -ness' }], '', ['noun'])
    expect(o?.parts).toEqual([{ word: 'kind' }, { word: '-ness' }])
  })

  it('ignores parts that spell another word, as a Compare sentence gives', () => {
    const o = originOf('cat', [{ name: 'compound', args: { 1: 'en', 2: 'dog', 3: 'house' }, expansion: 'dog + house' }], '', ['noun'])
    expect(o).toBeNull()
  })

  it('takes how the word was made only from the opening sentence', () => {
    const abduct = originOf('abduct', [
      { name: 'back-form', args: { 1: 'en', 2: 'abduction' }, expansion: 'Back-formation from abduction' },
    ], 'From Latin abductus.\n* (physiology): Back-formation from abduction.', ['verb'])
    expect(abduct).toBeNull()
    const roach = originOf('roach', [
      { name: 'bf', args: { 1: 'en', 2: 'cockroach' }, expansion: 'Back-formation from cockroach' },
    ], 'Back-formation from cockroach, as if it were a compound.', ['noun'])
    expect(roach?.kind).toEqual({ type: 'back-formation', word: 'cockroach' })
  })

  it('names who coined a word unless Wiktionary gives only a Wikidata id', () => {
    const grok = originOf('grok', [
      { name: 'coinage', args: { 1: 'en', 2: 'Robert A. Heinlein', in: '1961' }, expansion: 'Coined ex nihilo by American author Robert A. Heinlein in 1961' },
    ], 'Coined ex nihilo by American author Robert A. Heinlein in 1961 in his novel.', ['verb'])
    expect(grok?.kind).toEqual({ type: 'coinage', by: 'Robert A. Heinlein', year: '1961' })
  })

  it('collects English doublets', () => {
    const o = originOf('deal', [
      { name: 'inh', args: { 1: 'en', 2: 'enm', 3: 'dele', t: 'plank' }, expansion: 'Middle English dele (“plank”)' },
      { name: 'doublet', args: { 1: 'en', 2: 'theal<q:dialectal>', 3: 'thill' }, expansion: 'Doublet of (dialectal) theal and thill' },
    ], '', ['noun'])
    expect(o?.doublets).toEqual(['theal', 'thill'])
  })

  it('ends the chain at Proto-Indo-European and at a language it already passed through', () => {
    const step = (lang: string, word: string): KaikkiTemplate => ({ name: 'inh', args: { 1: 'en', 2: lang, 3: word }, expansion: word })
    const sea = originOf('sea', [step('enm', 'see'), step('ang', 'sǣ'), step('gem-pro', '*saiwiz'), step('ine-pro', '*sh₂ey-'), step('gem-pro', '*sīhwaną')], '', ['noun'])
    expect(sea?.chain.map((s) => s.word)).toEqual(['see', 'sǣ', '*saiwiz', '*sh₂ey-'])
    const water = originOf('water', [step('enm', 'wateren'), step('gem-pro', '*watrōną'), step('gem-pro', '*watōr'), step('ine-pro', '*wódr̥')], '', ['verb'])
    expect(water?.chain.map((s) => s.word)).toEqual(['wateren', '*watrōną'])
  })

  it('returns null for an etymology with nothing a learner can use', () => {
    expect(originOf('cat', [{ name: 'cog', args: { 1: 'sco', 2: 'cat' }, expansion: 'Scots cat' }], 'Related to Scots cat.', ['noun'])).toBeNull()
  })
})

describe('langNameOf', () => {
  it('reads the English name before the word', () => {
    expect(langNameOf(DICTIONARY[2])).toBe('Medieval Latin')
    expect(langNameOf({ name: 'bor+', args: { 1: 'en', 2: 'la-new', 3: 'encyclopēdīa' }, expansion: 'Borrowed from New Latin encyclopēdīa (“general education”)' }))
      .toBe('New Latin')
  })
})

describe('etymologyProse', () => {
  it('drops the Etymology tree block up to the line naming the word', () => {
    expect(etymologyProse('Etymology tree\nLatin grātīsbor.\nEnglish gratis\nBorrowed from Latin grātīs.', 'gratis')).toBe('Borrowed from Latin grātīs.')
  })
})

describe('senseGrammar', () => {
  it('keeps the learner tags and the word a sense is used with', () => {
    expect(senseGrammar(['uncountable', 'figuratively'], ['with to', 'of a person'])).toEqual(['uncountable', 'with to'])
    expect(senseGrammar([], ['followed by "with"', 'in the negative'])).toEqual(['with with', 'negative'])
  })

  it('reads with the as the definite-article tag', () => {
    expect(senseGrammar([], ['with the', 'with the definite article'])).toEqual(['with-definite-article'])
  })
})

describe('phonemicForms', () => {
  it('flattens phonemic transcriptions and spells an optional sound both ways', () => {
    expect(phonemicForms('/ˈaʊə(ɹ)/')).toEqual(['aʊə', 'aʊər'])
    expect(phonemicForms('/teɪ̯k/')).toEqual(['teɪk'])
    expect(phonemicForms('[ˈkʰæt]')).toEqual([])
    expect(phonemicForms(undefined)).toEqual([])
  })
})

describe('standardForms and leadForms', () => {
  const tent = [{ ipa: '/tɛnt/' }, { ipa: '/tɪnt/', tags: ['pin-pen-merger'] }]
  const what = [
    { ipa: '/wɒt/', tags: ['Received-Pronunciation'] }, { ipa: '/wɑt/', tags: ['US', 'sometimes'] },
    { ipa: '/wʌt/', note: 'wine–whine merger' }, { ipa: '/hɒt/', tags: ['Canada', 'dialectal'] },
  ]
  const are = [{ ipa: '/ə/', note: 'weak form' }, { ipa: '/ɑː/', note: 'strong form' }, { ipa: '/ɛə(ɹ)/', note: 'strong form' }]

  it('drops merged, dialect and weak pronunciations', () => {
    expect(standardForms(tent)).toEqual(['tɛnt'])
    expect(standardForms(what)).toEqual(['wɒt'])
    expect(standardForms(are)).toEqual(['ɑː', 'ɛə', 'ɛər'])
  })

  it('leads with the first standard UK and US rows', () => {
    expect(leadForms(are)).toEqual(['ɑː'])
    expect(leadForms([{ ipa: '/kat/', tags: ['UK'] }, { ipa: '/kæt/', tags: ['US'] }, { ipa: '/kɛt/', tags: ['New-Zealand'] }])).toEqual(['kat', 'kæt'])
  })
})

describe('syllablesOf', () => {
  it('keeps written syllables only when they spell the word', () => {
    expect(syllablesOf('discretion', [{ parts: ['dis', 'cre', 'tion'] }])).toEqual(['dis', 'cre', 'tion'])
    expect(syllablesOf('cat', [{ parts: ['cat'] }])).toBeNull()
    expect(syllablesOf('colour', [{ parts: ['col', 'or'] }])).toBeNull()
  })
})

describe('homophonesOf', () => {
  it('drops qualified homophones, case variants and words without an entry', () => {
    const known = new Set(['khat', 'qat'])
    const sounds = [{ homophone: 'Cat' }, { homophone: 'khat' }, { homophone: 'buck (without the foot-strut split)' }, { homophone: 'qat' }, { homophone: 'Kat' }]
    expect(homophonesOf('cat', sounds, (w) => known.has(w))).toEqual(['khat', 'qat'])
  })

  it('keeps a homophone that only names its etymology', () => {
    const sounds = [{ homophone: 'won (etymology 1)' }, { homophone: 'won (etymologies 2 and 3)' }, { homophone: 'own (toe–tow merger)' }]
    expect(homophonesOf('one', sounds, () => true)).toEqual(['won'])
  })
})
