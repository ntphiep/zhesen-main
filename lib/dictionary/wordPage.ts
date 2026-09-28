import { posGroup } from './pos'
import { classifyRelations } from './relations'
import { entryPath, searchPath } from './entryId'
import { hasUnknownLongWord, isClassifierGloss, isCleanExample, isSentenceTranslation, rankSenses } from './textQuality'
import type { ResolvedText } from './tappable'
import type { DictEntryDetail, DictExample, DictRelation, DictSense, TermPreview } from './types'
import type { LangCode } from '@/lib/languages'

/**
 * The shape of the word page: senses grouped by part of speech, one example under each
 * sense, the rest under "Ví dụ khác", and the related words as deduplicated tabs. The page
 * resolves on the server every example text `exampleCandidates` returns, and shows no other.
 */

export const SHOWN_SENSES = 5
export const SHOWN_EXAMPLES = 3
/** Sentences "Ví dụ khác" can list after expanding. */
export const MAX_OTHER_EXAMPLES = 6
/** Words a related-words list carries. take has 249 synonyms, and every item is
 *  serialised into the page. */
export const MAX_TAB_ITEMS = 40
/** Words per list whose meaning and part of speech are looked up: the rows a table shows
 *  before expanding. en:head has 1,569 relations, and previewing all of them took 1.85 s
 *  against the anon role's 3 s statement timeout. */
export const PREVIEWED_ITEMS = 12

export interface SenseSection {
  /** Canonical part-of-speech key, '' for senses without one. */
  key: string
  anchor: string
  labelVi: string
  /** Every sense of this part of speech, in `rankSenses` order. */
  senses: DictSense[]
}

/** Sections in dictionary order of their first sense. Classifier notes are not meanings. */
export function senseSections(senses: DictSense[]): SenseSection[] {
  const sections = new Map<string, SenseSection>()
  const first = new Map<string, number>()
  for (const s of senses) {
    if (isClassifierGloss(s.glossEn)) continue
    const g = posGroup(s.pos)
    const key = g?.key ?? ''
    const sec = sections.get(key) ?? {
      key, anchor: `pos-${key.replace(/[^a-z0-9]+/gi, '-') || 'other'}`, labelVi: g?.labelVi ?? 'Nghĩa', senses: [],
    }
    sec.senses.push(s)
    sections.set(key, sec)
    first.set(key, Math.min(first.get(key) ?? Infinity, s.senseOrder))
  }
  return [...sections.values()]
    .sort((a, b) => (first.get(a.key) ?? 0) - (first.get(b.key) ?? 0))
    .map((sec) => ({ ...sec, senses: rankSenses(sec.senses) }))
}

/** The first Vietnamese term of a sense, the way the summary line cuts it. */
export function senseLabel(s: DictSense): string {
  const vi = (s.glossVi ?? s.pivotVi)?.split(/[,;](?![^(]*\))/)[0].trim()
  return vi || s.glossEn?.split(/[,;(]/)[0].trim() || ''
}

/** The senses the overview leads with: the first of every part of speech, then the rest
 *  of the budget from the first part of speech, which is the one the word is used as most. */
export function mainSenses(sections: SenseSection[], max = 4): { section: SenseSection; senses: DictSense[] }[] {
  const quota = sections.map((s, i) => (i < max ? Math.min(1, s.senses.length) : 0))
  let left = max - quota.reduce((a, b) => a + b, 0)
  for (let i = 0; i < sections.length && left > 0; i++) {
    const extra = Math.min(left, sections[i].senses.length - quota[i])
    quota[i] += extra
    left -= extra
  }
  return sections.map((section, i) => ({ section, senses: section.senses.slice(0, quota[i]) })).filter((g) => g.senses.length > 0)
}

/** The entry's own meanings, which a copied "translation" repeats; see isSentenceTranslation. */
export function entryGlosses(detail: Pick<DictEntryDetail, 'glossVi' | 'senses'>): (string | null)[] {
  return [detail.glossVi, ...detail.senses.map((s) => s.glossVi)]
}

/** Up to five first Vietnamese terms of the senses each section shows, joined. */
export function summaryLine(sections: SenseSection[]): string | null {
  const terms: string[] = []
  for (const sec of sections) {
    for (const s of sec.senses.slice(0, SHOWN_SENSES)) {
      // A comma inside parentheses belongs to the term: "đi (xe, tàu)".
      const term = (s.glossVi ?? s.pivotVi)?.split(/[,;](?![^(]*\))/)[0].trim()
      if (term && !terms.some((t) => t.toLowerCase() === term.toLowerCase())) terms.push(term)
      if (terms.length === 5) return terms.join(' · ')
    }
  }
  return terms.length > 0 ? terms.join(' · ') : null
}

/** The examples the page can show: the first one linked to each sense a section shows
 *  before expanding, then up to MAX_OTHER_EXAMPLES others, unlinked ones first. A sense past
 *  the fold shows no example, so no sentence has to resolve itself from the browser. */
export function exampleCandidates(sections: SenseSection[], examples: DictExample[]): DictExample[] {
  const shown = new Set(sections.flatMap((sec) => sec.senses.slice(0, SHOWN_SENSES).map((s) => s.id)))
  const clean = examples.filter((e) => isCleanExample(e.text))
  const linked = clean.filter((e) => e.senseId && shown.has(e.senseId))
  const first = linked.filter((e, i) => linked.findIndex((x) => x.senseId === e.senseId) === i)
  const rest = [...clean.filter((e) => !e.senseId), ...linked.filter((e) => !first.includes(e))]
  return [...first, ...rest.slice(0, MAX_OTHER_EXAMPLES)]
}

/** Drops a sentence whose words the dictionary cannot account for; see hasUnknownLongWord.
 *  Chinese is exempt, and a sentence the server did not resolve is kept. */
export function knownWordExamples(examples: DictExample[], resolved: ResolvedText[], lang: LangCode): DictExample[] {
  if (lang === 'zh') return examples
  const byText = new Map(resolved.map((r) => [r.text, r]))
  return examples.filter((e) => {
    const r = byText.get(e.text)
    return !r || !hasUnknownLongWord(r.segments, new Set(r.entries.map(([token]) => token)))
  })
}

export interface ExamplePlan {
  /** The one example shown under a sense, keyed by sense id. */
  bySense: Record<string, DictExample>
  /** Everything else, those with a real translation first. */
  others: DictExample[]
}

export function planExamples(sections: SenseSection[], examples: DictExample[], glosses: (string | null)[]): ExamplePlan {
  const clean = examples.filter((e) => isCleanExample(e.text))
  const translated = (e: DictExample) => isSentenceTranslation(e.translationVi, glosses)
  const bySense: Record<string, DictExample> = {}
  const used = new Set<DictExample>()
  for (const s of sections.flatMap((sec) => sec.senses)) {
    if (!s.id) continue
    const linked = clean.filter((e) => e.senseId === s.id)
    const pick = linked.find(translated) ?? linked[0]
    if (pick) { bySense[s.id] = pick; used.add(pick) }
  }
  const rest = clean.filter((e) => !used.has(e))
  return { bySense, others: [...rest.filter(translated), ...rest.filter((e) => !translated(e))] }
}

/** A derived single word that shares nothing with the stem is a data error: take lists
 *  "thou". Kept when it contains the stem or shares its first min(3, len-1) letters, which
 *  keeps comida under comer and speech under speak. */
export function isPlausibleDerived(text: string, stem: string): boolean {
  const t = text.toLowerCase()
  const s = stem.toLowerCase()
  if (/[\s-]/.test(t) || t.includes(s)) return true
  const n = Math.min(3, s.length - 1)
  return t.slice(0, n) === s.slice(0, n)
}

export interface RelatedItem {
  text: string
  href: string
  gloss: string | null
  /** The gloss is English, standing in for a missing Vietnamese one. */
  glossIsEnglish?: boolean
  /** True when the item came from an entry row, which carries its own gloss. */
  entry: boolean
  /** The entry behind the item, when the dictionary holds one. */
  id: string | null
  pos: string | null
  level: string | null
}

export interface RelatedTab {
  key: string
  label: string
  items: RelatedItem[]
}

interface EntryLike {
  id: string; headword: string; glossVi: string | null; glossEn: string | null
  pos?: string | null; level?: string | null
}

const isPhrase = (t: string) => /[\s-]/.test(t)

/** Tabs in reading order, only the non-empty ones. An item appears once, in the first tab
 *  it fits, and never when it is the headword or one of its own inflected forms. WordNet's
 *  broader, narrower and same-kind terms are left out: take's 401 were a list of unrelated
 *  verbs. */
export function relatedTabs({ lang, headword, lemma, relations, containing, kin, formTexts, previews }: {
  lang: LangCode
  headword: string
  lemma: string | null
  relations: DictRelation[]
  containing: EntryLike[]
  kin: EntryLike[]
  formTexts: string[]
  previews: Record<string, TermPreview>
}): RelatedTab[] {
  const c = classifyRelations(relations)
  const fromText = (texts: string[]): RelatedItem[] => texts.map((text) => {
    const p = previews[text.toLowerCase()]
    return {
      text, href: p ? entryPath(p.id) : searchPath(lang, text), gloss: p?.glossVi || p?.glossEn || null,
      glossIsEnglish: !p?.glossVi && !!p?.glossEn,
      entry: false, id: p?.id ?? null, pos: p?.pos ?? null, level: null,
    }
  })
  const fromEntry = (w: EntryLike): RelatedItem => ({
    text: w.headword, href: entryPath(w.id), gloss: w.glossVi || w.glossEn || null, glossIsEnglish: !w.glossVi && !!w.glossEn, entry: true,
    id: w.id, pos: w.pos ?? previews[w.headword.toLowerCase()]?.pos ?? null, level: w.level ?? null,
  })
  const kinItems = kin.map(fromEntry)
  const candidates: RelatedTab[] = [
    { key: 'collocations', label: 'Kết hợp từ', items: fromText(c.collocations) },
    { key: 'compounds', label: 'Cụm từ', items: [...containing.map(fromEntry), ...kinItems.filter((i) => isPhrase(i.text)), ...fromText(c.compounds)] },
    { key: 'derived', label: 'Phái sinh', items: [...kinItems.filter((i) => !isPhrase(i.text)), ...fromText(c.derived.filter((t) => isPlausibleDerived(t, lemma ?? headword)))] },
    { key: 'synonyms', label: 'Cận nghĩa', items: fromText(c.synonyms) },
    { key: 'antonyms', label: 'Trái nghĩa', items: fromText(c.antonyms) },
    { key: 'related', label: 'Cùng gốc từ', items: fromText(c.related) },
  ]
  const seen = new Set([headword, ...formTexts].map((t) => t.toLowerCase()))
  return candidates
    .map((tab) => ({
      ...tab,
      items: tab.items.filter((i) => {
        const k = i.text.toLowerCase()
        if (seen.has(k)) return false
        seen.add(k)
        return true
      }).slice(0, MAX_TAB_ITEMS),
    }))
    .filter((tab) => tab.items.length > 0)
}
