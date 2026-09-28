import { formLineLemma, pointerLemma } from './lemma'
import { isClassifierGloss, isSentenceTranslation } from './textQuality'
import { mainSenses, senseSections } from './wordPage'
import type { LangCode } from '@/lib/languages'
import type { LearnerLayer, LearnerLink, LearnerSense, SenseLabel } from './learner'
import type { DictExample, DictSense, TermPreview } from './types'

/** `lex.sources.id` of the rows a model wrote. */
export const MODEL_SOURCE = 'zhesen-ai'

/**
 * A learner layer built from the dictionary's own senses, for an entry the model has not
 * reached: the same shape as the AI layer, with nothing written by a model. The AI layer
 * replaces it wherever one is published.
 */

/** CC-CEDICT lines that describe the entry rather than give a meaning: 打's "Taiwan pr.
 *  [da3]", "variant of 着[zhe5]", "see 打算[da3 suan4]", "used in 打扮". Chinese only: in
 *  Wiktionary "Used in forming the perfect aspect." is a sense of have. */
const NOT_A_MEANING = /^(?:Taiwan pr\.|(?:(?:old|archaic|erhua|ancient|Japanese) )?variant of |see (?:also )?|used in )/i

/** Main senses per count of real meanings, inside the ranges the AI layer is asked for. */
export function coreBudget(meanings: number): number {
  if (meanings <= 3) return meanings
  if (meanings < 10) return 3
  return meanings <= 40 ? 5 : 7
}

/** Vietnamese terms of a gloss, split where the summary line splits: "đi (xe, tàu)" is one. */
const splitTerms = (vi: string) => vi.split(/[,;](?![^(]*\))/).map((t) => t.replace(/\.$/, '').trim()).filter(Boolean)

/** A term longer than this reads as a definition, which goes under the terms instead. */
const MAX_TERM = 40
const MAX_TERMS = 3

/** Leading labels such as "(slang, boxing)", which carry commas of their own. */
const LEADING_LABELS = /^(?:\s*\([^)]*\))+\s*/

function terms(s: DictSense): { viTerms: string[]; viDefinition: string } {
  const vi = s.glossVi ?? s.pivotVi
  if (!vi) {
    const en = s.glossEn?.replace(LEADING_LABELS, '').split(/[.;:]|,\s/)[0].trim() ?? ''
    return { viTerms: en ? [en] : [], viDefinition: '' }
  }
  const pieces = splitTerms(vi)
  const short = pieces.filter((t) => t.length <= MAX_TERM)
  const viTerms = (short.length > 0 ? short : pieces).slice(0, MAX_TERMS)
  const covered = pieces.every((p) => viTerms.includes(p))
  return { viTerms, viDefinition: covered ? '' : vi }
}

export interface DerivedLayerInput {
  entryId: string
  lang: LangCode
  senses: DictSense[]
  /** The one example planned under each sense, keyed by sense id. */
  examplesBySense: Record<string, DictExample>
  /** The entry's own meanings, which a copied "translation" repeats. */
  glosses: (string | null)[]
  senseSynonyms: { senseOrder: number; words: { text: string; id: string | null; gloss: string | null }[] }[]
  previews: Record<string, TermPreview>
}

export function deriveLearnerLayer({
  entryId, lang, senses, examplesBySense, glosses, senseSynonyms, previews,
}: DerivedLayerInput): LearnerLayer | null {
  const ordered = [...senses].sort((a, b) => a.senseOrder - b.senseOrder)
  const lemmaOf = new Map<DictSense, string>()
  // CC-CEDICT writes no word-form pointers, and its "(idiom) of long standing" reads as one.
  if (lang !== 'zh') {
    ordered.forEach((s, i) => {
      const lemma = pointerLemma(s.glossEn, i) ?? formLineLemma(ordered, i)
      if (lemma) lemmaOf.set(s, lemma)
    })
  }
  const note = (s: DictSense) => lang === 'zh' && NOT_A_MEANING.test(s.glossEn?.trim() ?? '')
  const real = ordered.filter((s) => !isClassifierGloss(s.glossEn) && !lemmaOf.has(s) && !note(s))
  // A form of another word, or a page of notes, keeps the classic layout: a learner layout
  // with no main sense draws empty columns.
  if (real.length === 0) return null
  const budget = coreBudget(real.length)
  const sections = senseSections(real)
  // The overview's own "Nghĩa chính" first, so both layouts lead with the same meanings.
  const lead = mainSenses(sections, Math.min(4, budget)).flatMap((g) => g.senses)
  const main = [...lead, ...mainSenses(sections, budget).flatMap((g) => g.senses).filter((s) => !lead.includes(s))]

  const link = (w: { text: string; id: string | null; gloss: string | null }): LearnerLink => ({
    kind: 'synonym', text: w.text, lang, targetEntryId: w.id, pattern: null, vi: w.gloss, noteVi: null,
    example: null, exampleVi: null, reading: null, exampleReading: null,
  })
  const core: LearnerSense[] = main.map((s, i) => {
    const example = s.id ? examplesBySense[s.id] : undefined
    const translated = example && isSentenceTranslation(example.translationVi, glosses) ? example : null
    return {
      order: i + 1,
      pos: s.pos,
      ...terms(s),
      pivot: !s.glossVi && Boolean(s.pivotVi),
      enDefinition: s.glossEn,
      domain: null,
      register: null,
      cefr: null,
      sourceSenseIds: s.id ? [s.id] : [],
      examples: translated
        ? [{
          text: translated.text, reading: translated.reading, vi: translated.translationVi ?? '', sourceExampleId: null,
          byModel: translated.sourceId === MODEL_SOURCE, sourceId: translated.sourceId ?? null,
        }]
        : [],
      collocations: [],
      synonyms: (senseSynonyms.find((g) => g.senseOrder === s.senseOrder)?.words ?? []).map(link),
      antonyms: [],
      equivalents: [],
    }
  })

  const labels: SenseLabel[] = ordered.flatMap((s) => {
    if (!s.id || isClassifierGloss(s.glossEn)) return []
    const at = main.indexOf(s)
    const lemma = lemmaOf.get(s) ?? null
    return [{
      senseId: s.id,
      coreSenseOrder: at < 0 ? null : at + 1,
      viTerms: s.glossVi || s.pivotVi ? terms(s).viTerms : [],
      domain: null,
      register: null,
      isInflection: lemma !== null,
      lemma,
      lemmaEntryId: lemma ? previews[lemma.toLowerCase()]?.id ?? null : null,
    }]
  })

  const gist: string[] = []
  for (const s of core) {
    const first = s.viTerms[0]
    if (!first || !(main[s.order - 1].glossVi || main[s.order - 1].pivotVi)) continue
    if (!gist.some((g) => g.toLocaleLowerCase('vi') === first.toLocaleLowerCase('vi'))) gist.push(first)
    if (gist.length === 3) break
  }

  return {
    entryId, source: 'dictionary', gistVi: gist, level: null, usageNoteVi: null, status: 'published',
    senses: core, confusables: [], labels,
  }
}
