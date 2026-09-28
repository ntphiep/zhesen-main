import { buildConjugation, type Conjugation } from './conjugation'
import { entryPath } from './entryId'
import { groupWordForms } from './family'
import { entryMeaningVi, isCleanExample } from './textQuality'
import {
  entryGlosses, exampleCandidates, knownWordExamples, planExamples, relatedTabs, senseSections, summaryLine,
  type RelatedItem, type SenseSection,
} from './wordPage'
import type { LangCode } from '@/lib/languages'
import type { ResolvedText } from './tappable'
import type {
  CharInfo, ContainingWord, CrossLangSibling, DictEntryDetail, DictEntryPreview, DictExample, DictSense, TermPreview,
  WordForm,
} from './types'
import type { GrammarPoint } from '@/lib/grammar/types'

/** Everything the three word-page layouts draw, as plain data, built once on the server. */

export interface ViewWord {
  text: string
  href: string
  /** The entry behind the word, when the dictionary has one. */
  id: string | null
  gloss: string | null
  pos: string | null
  level: string | null
}

/** A word of the family split around the stem it shares with the headword. */
export interface FamilyWord extends ViewWord {
  before: string
  stem: string
  after: string
}

/** An inflected form split into what it keeps of the headword and what it changes. */
export interface ViewForm {
  text: string
  label: string
  kept: string
  changed: string
  irregular: boolean
}

export interface SenseSynonyms {
  senseOrder: number
  /** The sense's first Vietnamese term, or its English gloss when it has none. */
  label: string
  words: ViewWord[]
}

export interface WordView {
  /** The entry without senses, relations or the examples the save button does not read. */
  head: DictEntryDetail
  hanViet: string | null
  lemma: string | null
  lemmaPreview: TermPreview | null
  senses: DictSense[]
  summary: string | null
  meaningVi: string | null
  forms: ViewForm[]
  conjugation: Conjugation | null
  phrases: ViewWord[]
  family: FamilyWord[]
  senseSynonyms: SenseSynonyms[]
  /** Synonyms no sense claimed. */
  synonyms: ViewWord[]
  antonyms: ViewWord[]
  /** Wiktionary's "related terms": same root, meaning may have drifted. */
  related: ViewWord[]
  siblings: CrossLangSibling[]
  characters: CharInfo[]
  /** The one example shown under a sense, keyed by sense id. */
  examplesBySense: Record<string, DictExample>
  examples: DictExample[]
  resolved: ResolvedText[]
  /** The entry's own meanings, which a copied "translation" repeats. */
  glosses: (string | null)[]
  grammarPoints: GrammarPoint[]
}

export interface WordViewInput {
  detail: DictEntryDetail
  lemma?: string | null
  characters: CharInfo[]
  siblings: CrossLangSibling[]
  inflections?: WordForm[]
  grammarPoints?: GrammarPoint[]
  containing?: ContainingWord[]
  kin?: DictEntryPreview[]
  previews?: Record<string, TermPreview>
  resolvedExamples?: ResolvedText[]
}

const toWord = ({ text, href, id, gloss, pos, level }: RelatedItem): ViewWord => ({ text, href, id, gloss, pos, level })

const LANG_ORDER = ['zh', 'es', 'en']

/** The order a learner meets the forms in: the -s form, the past, the participles, then
 *  degrees. Any other label keeps its place after these. */
const FORM_ORDER = [
  'Ngôi thứ ba số ít', 'Số nhiều', 'Quá khứ', 'Quá khứ và phân từ II', 'Phân từ II (quá khứ)', 'Phân từ I (-ing)',
  'So sánh hơn', 'So sánh nhất',
]
const formRank = (label: string) => {
  const i = FORM_ORDER.indexOf(label)
  return i < 0 ? FORM_ORDER.length : i
}

/** Inflection labels of each part of speech. A spelling two parts share keeps the label
 *  it is read with first, so the entry's leading part goes first: takes under take is the
 *  -s form of the verb, not the plural of the noun. */
const FORM_POS: Record<string, RegExp> = { verb: /person|past|participle|gerund|infinitive/, noun: /\bplural\b/ }

function leadingForms(inflections: WordForm[], pos: string | undefined): WordForm[] {
  const mine = pos ? FORM_POS[pos] : undefined
  if (!mine) return inflections
  const is = (f: WordForm) => mine.test(f.formLabel ?? '')
  return [...inflections.filter(is), ...inflections.filter((f) => !is(f))]
}

/** English endings that follow the rules; anything else changes the stem. */
const REGULAR_EN = /^(s|es|d|ed|ing|r|er|st|est)$/

function commonPrefix(a: string, b: string): number {
  let i = 0
  while (i < a.length && i < b.length && a[i].toLowerCase() === b[i].toLowerCase()) i++
  return i
}

/** take to takes, took, taken, taking: the kept part is what the form shares with the
 *  headword. An English form is irregular unless it adds a regular ending, allowing for a
 *  dropped final e (taking), y to i (tried) and a doubled consonant (stopped). */
export function splitForm(headword: string, form: string, lang: string): { kept: string; changed: string; irregular: boolean } {
  // take part to takes part: only the first word inflects, so only it is judged.
  const space = headword.indexOf(' ')
  if (space > 0 && form.toLowerCase().endsWith(headword.slice(space).toLowerCase())) {
    const first = splitForm(headword.slice(0, space), form.slice(0, form.length - (headword.length - space)), lang)
    return { kept: first.kept, changed: form.slice(first.kept.length), irregular: first.irregular }
  }
  const n = commonPrefix(headword, form)
  const kept = form.slice(0, n)
  const changed = form.slice(n)
  if (lang !== 'en' || !changed) return { kept, changed, irregular: false }
  const dropped = headword.slice(n).toLowerCase()
  const added = changed.toLowerCase()
  const doubled = added[0] === headword.slice(-1).toLowerCase() && /^(ed|ing|er|est)$/.test(added.slice(1))
  const regular =
    (dropped === '' && (REGULAR_EN.test(added) || doubled)) ||
    (dropped === 'e' && /^(ed|ing|er|est)$/.test(added)) ||
    (dropped === 'y' && /^i(es|ed|er|est)$/.test(added))
  return { kept, changed, irregular: !regular }
}

/** mistake around take, speech around speak: the stem where it occurs whole, otherwise the
 *  shared beginning. Under two shared letters nothing is marked. */
export function splitAroundStem(word: string, stem: string): { before: string; stem: string; after: string } {
  const at = word.toLowerCase().indexOf(stem.toLowerCase())
  if (stem && at >= 0) {
    return { before: word.slice(0, at), stem: word.slice(at, at + stem.length), after: word.slice(at + stem.length) }
  }
  const n = commonPrefix(word, stem)
  return n >= 2 ? { before: '', stem: word.slice(0, n), after: word.slice(n) } : { before: '', stem: word, after: '' }
}

/** The first Vietnamese term of a sense, the way the summary line cuts it. */
export function senseLabel(s: DictSense): string {
  const vi = (s.glossVi ?? s.pivotVi)?.split(/[,;](?![^(]*\))/)[0].trim()
  return vi || s.glossEn?.split(/[,;(]/)[0].trim() || ''
}

export function buildWordView({
  detail, lemma = null, characters, siblings, inflections = [], grammarPoints = [], containing = [], kin = [],
  previews = {}, resolvedExamples = [],
}: WordViewInput): WordView {
  // Spanish verbs get the conjugation table instead of a line of forms, which for them
  // would run to hundreds.
  const conjugation = detail.lang === 'es' ? buildConjugation(inflections) : null
  const sections = senseSections(detail.senses)
  const allForms = groupWordForms(leadingForms(inflections, sections[0]?.key))
  const forms = conjugation ? [] : allForms
    .filter((f) => f.standard && f.text.toLowerCase() !== detail.headword.toLowerCase())
    .sort((a, b) => formRank(a.label) - formRank(b.label))
    .map((f) => ({ text: f.text, label: f.label, ...splitForm(detail.headword, f.text, detail.lang) }))

  const glosses = entryGlosses(detail)
  const candidates = knownWordExamples(exampleCandidates(sections, detail.examples), resolvedExamples, detail.lang)
  const plan = planExamples(sections, candidates, glosses)

  const tabs = relatedTabs({
    lang: detail.lang, headword: detail.headword, lemma, relations: detail.relations,
    containing, kin, formTexts: allForms.map((f) => f.text), previews,
  })
  const tab = (key: string) => tabs.find((t) => t.key === key)?.items ?? []
  const stem = lemma ?? detail.headword

  // A synonym that belongs to a sense is listed under it, in the order the senses are
  // shown, and nowhere else. The other lists keep what they already hold, as relatedTabs
  // lists a word once.
  const listed = new Set(
    [detail.headword, ...allForms.map((f) => f.text), ...['collocations', 'compounds', 'derived', 'antonyms', 'related'].flatMap((k) => tab(k).map((i) => i.text))]
      .map((t) => t.toLowerCase()),
  )
  const bySense = new Map<number, ViewWord[]>()
  const claimed = new Set<string>()
  for (const link of detail.senseLinks ?? []) {
    if (listed.has(link.text.toLowerCase()) || claimed.has(link.text.toLowerCase())) continue
    const words = bySense.get(link.senseOrder) ?? []
    const p = previews[link.text.toLowerCase()]
    words.push({
      text: link.text, href: entryPath(link.targetId), id: link.targetId,
      gloss: p?.glossVi || p?.glossEn || null, pos: p?.pos ?? null, level: null,
    })
    bySense.set(link.senseOrder, words)
    claimed.add(link.text.toLowerCase())
  }
  const senseSynonyms = sections.flatMap((sec) => sec.senses)
    .filter((s) => bySense.has(s.senseOrder))
    .map((s) => ({ senseOrder: s.senseOrder, label: senseLabel(s), words: bySense.get(s.senseOrder) ?? [] }))

  // Glossed phrases first; the SQL order already puts the ones a learner meets first, and
  // the collocations, chosen for learners, go ahead of both.
  const phrases = [...tab('collocations'), ...tab('compounds')].map(toWord)
  const glossedFirst = [...phrases.filter((w) => w.gloss), ...phrases.filter((w) => !w.gloss)]

  return {
    head: { ...detail, senses: [], relations: [], senseLinks: [], examples: detail.examples.filter((e) => e.translationVi) },
    hanViet: detail.lang === 'zh' ? characters.map((c) => c.hanViet[0]).filter(Boolean).join(' ') || null : null,
    lemma,
    lemmaPreview: lemma ? previews[lemma.toLowerCase()] ?? null : null,
    senses: detail.senses,
    summary: summaryLine(sections),
    meaningVi: entryMeaningVi(detail),
    forms,
    conjugation,
    phrases: glossedFirst,
    family: tab('derived').map((i) => ({ ...toWord(i), ...splitAroundStem(i.text, stem) })),
    senseSynonyms,
    synonyms: tab('synonyms').filter((i) => !claimed.has(i.text.toLowerCase())).map(toWord),
    antonyms: tab('antonyms').map(toWord),
    related: tab('related').map(toWord),
    // Chinese, then Spanish, then English, as the cross-language card orders them.
    siblings: [...siblings].sort((a, b) => LANG_ORDER.indexOf(a.lang) - LANG_ORDER.indexOf(b.lang)),
    characters,
    examplesBySense: plan.bySense,
    examples: plan.others,
    resolved: resolvedExamples,
    glosses,
    grammarPoints,
  }
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

export interface SenseGroup {
  label: string
  senses: DictSense[]
}

/** Senses gathered under the Vietnamese term they lead with, in the order each term first
 *  appears: take's "cầm, nắm" and "cầm lấy" are one group, "chiếm lấy" another. */
export function groupSenses(senses: DictSense[]): SenseGroup[] {
  const groups = new Map<string, SenseGroup>()
  for (const s of senses) {
    const label = senseLabel(s)
    if (!label) continue
    const key = label.toLocaleLowerCase('vi')
    const g = groups.get(key) ?? { label, senses: [] }
    g.senses.push(s)
    groups.set(key, g)
  }
  return [...groups.values()]
}

/** The example sentences a layout may show: short, clean, and made of words the
 *  dictionary knows. */
export function cleanExamples(examples: DictExample[], resolved: ResolvedText[], lang: LangCode): DictExample[] {
  return knownWordExamples(examples.filter((e) => isCleanExample(e.text)), resolved, lang)
}

/** The headword and its forms, which an example sentence sets in bold. */
export function headwordForms(view: Pick<WordView, 'head' | 'forms'>): string[] {
  return [view.head.headword, ...view.forms.map((f) => f.text)].map((t) => t.toLowerCase())
}

/** Which of the overview's two columns each tile joins, in order: a `wide` tile the first,
 *  wider one, any other the shorter one, so the columns end close together. Ties go to
 *  the first. */
export function balanceColumns(heights: number[], wide: boolean[] = []): (0 | 1)[] {
  const totals = [0, 0]
  return heights.map((h, i) => {
    const side = !wide[i] && totals[1] < totals[0] ? 1 : 0
    totals[side] += h
    return side
  })
}

/** English particles that make a phrasal verb out of the headword: take up, take off. */
const PARTICLES = new Set([
  'up', 'down', 'in', 'out', 'on', 'off', 'over', 'away', 'back', 'about', 'after', 'along', 'apart', 'around',
  'aside', 'through', 'under', 'by', 'for', 'to', 'with', 'into', 'upon', 'forward', 'together',
])

/** The phrases that are the headword plus one particle, and the rest. */
export function splitPhrasalVerbs(headword: string, phrases: ViewWord[]): { phrasal: (ViewWord & { particle: string })[]; other: ViewWord[] } {
  const phrasal: (ViewWord & { particle: string })[] = []
  const other: ViewWord[] = []
  const prefix = `${headword.toLowerCase()} `
  for (const w of phrases) {
    const rest = w.text.toLowerCase().startsWith(prefix) ? w.text.slice(prefix.length) : ''
    if (PARTICLES.has(rest.toLowerCase())) phrasal.push({ ...w, particle: rest })
    else other.push(w)
  }
  return { phrasal, other }
}
