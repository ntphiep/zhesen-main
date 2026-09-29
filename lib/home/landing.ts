import { getCachedEntryDetail, getCachedSearch } from '@/lib/dictionary/cached'
import { getCachedLearnerLayer } from '@/lib/dictionary/learnerCached'
import { markHeadword, minorSenses, type LearnerLayer, type LearnerLink } from '@/lib/dictionary/learner'
import { entryPath } from '@/lib/dictionary/entryId'
import type { DictEntryDetail, DictEntryPreview } from '@/lib/dictionary/types'
import { LANG_CODES, type LangCode } from '@/lib/languages'
import { PHONEMES } from '@/lib/theory/en/pronunciation'
import { COLLOCATION_PATTERNS } from '@/lib/theory/en/collocation'
import { theoryBlockPath } from '@/lib/theory/path'
import { COLLOCATION_SLIPS, EXAMPLE_QUERY, GRAMMAR_SLIPS, SOUND_SLIPS, TAKE_ENTRY } from './content'

/** What the landing page reads on the server. Every read is cached, so the page stays static. */

export type Answers = Record<LangCode, DictEntryPreview[]>

/** The hero's example lookup, from the same cache entry as `GET /dictionary/search?q=hoa&dir=vi`.
 *  Null when the read fails; the browser then asks the route itself. */
export async function loadExample(): Promise<Answers | null> {
  try {
    return (await getCachedSearch(EXAMPLE_QUERY, [...LANG_CODES], 'vi')).entries
  } catch (e) {
    console.error('landing example failed', e)
    return null
  }
}

export interface TakeSense {
  terms: string
  level: string | null
  definition: string
  example: { parts: { text: string; mark: boolean }[]; vi: string } | null
  zh: string
  es: string
  collocations: { text: string; pattern: string | null; vi: string | null }[]
  /** The first synonym, then the first antonym or else a second synonym. */
  notes: { text: string; antonym: boolean; note: string | null }[]
}
export interface TakeMap {
  headword: string
  href: string
  senses: TakeSense[]
  /** The minor senses, one label each. */
  tail: string[]
}

/** Registers the landing page leaves out of take's minor senses. */
const UNSHOWN_REGISTERS = new Set(['vulgar', 'offensive'])

export function takeMap(layer: LearnerLayer, detail: Pick<DictEntryDetail, 'headword' | 'senses'>): TakeMap {
  const terms = (links: LearnerLink[], lang: LangCode) => links.filter((l) => l.lang === lang).map((l) => l.text).join(', ')
  const senses = layer.senses.map((s): TakeSense => {
    const first = s.examples[0]
    const notes = [
      ...s.synonyms.slice(0, 1).map((l) => ({ text: l.text, antonym: false, note: l.noteVi })),
      ...(s.antonyms.length
        ? s.antonyms.slice(0, 1).map((l) => ({ text: l.text, antonym: true, note: l.noteVi }))
        : s.synonyms.slice(1, 2).map((l) => ({ text: l.text, antonym: false, note: l.noteVi }))),
    ]
    return {
      terms: s.viTerms.join(', '),
      level: s.cefr,
      definition: s.viDefinition,
      example: first ? { parts: markHeadword(first.text, detail.headword, 'en'), vi: first.vi } : null,
      zh: terms(s.equivalents, 'zh'),
      es: terms(s.equivalents, 'es'),
      collocations: s.collocations.map((c) => ({ text: c.text, pattern: c.pattern, vi: c.vi })),
      notes,
    }
  })
  const tail = [...new Set(minorSenses(layer, detail.senses).other
    .filter((m) => !UNSHOWN_REGISTERS.has(m.register ?? '') && m.viTerms.length)
    .map((m) => m.viTerms.join(', ')))]
  return { headword: detail.headword, href: entryPath(layer.entryId), senses, tail }
}

/** The meaning map of take, or null when either read comes back empty. */
export async function loadTake(): Promise<TakeMap | null> {
  const [layer, detail] = await Promise.all([
    getCachedLearnerLayer(TAKE_ENTRY),
    getCachedEntryDetail(TAKE_ENTRY).catch((e: unknown) => { console.error('landing take failed', e); return null }),
  ])
  return layer && detail && layer.senses.length ? takeMap(layer, detail) : null
}

export type SlipKind = 'sound' | 'colloc' | 'grammar'
export interface Slip {
  said: string
  saidLang: LangCode | null
  right: string
  rightLang: LangCode
  pron: string | null
  vi: string | null
  why: string
  href: string
  linkText: string
}

/** Where Vietnamese speakers slip, with the explanations the theory pages already carry. */
export function slips(): Record<SlipKind, Slip[]> {
  const pronunciation = theoryBlockPath('en', 'pronunciation')
  const collocation = theoryBlockPath('en', 'collocation')
  const mistakes = COLLOCATION_PATTERNS.flatMap((p) => p.mistakes)
  return {
    sound: SOUND_SLIPS.flatMap((s) => {
      const why = PHONEMES.find((p) => p.symbol === s.symbol)?.trapVi
      return why ? [{ said: s.said, saidLang: null, right: s.right, rightLang: 'en', pron: s.pron, vi: null, why, href: pronunciation, linkText: 'Bảng phát âm' }] : []
    }),
    colloc: COLLOCATION_SLIPS.flatMap((s) => {
      const m = mistakes.find((x) => x.wrong === s.wrong)
      return m ? [{ said: m.wrong, saidLang: null, right: m.right, rightLang: 'en', pron: null, vi: s.vi, why: m.whyVi, href: collocation, linkText: 'Collocation' }] : []
    }),
    grammar: GRAMMAR_SLIPS.map((s) => ({ said: s.said, saidLang: s.lang, right: s.right, rightLang: s.lang, pron: null, vi: s.vi, why: s.why, href: s.href, linkText: s.linkText })),
  }
}
