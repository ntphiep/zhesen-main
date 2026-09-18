import type { WordForm } from './types'

/**
 * Spanish verb conjugation parsed from an entry's `lex.inflections` rows. Only the Spanish
 * label vocabulary (`indicativo presente yo`) is parsed; the English one Wiktionary also
 * writes is ambiguous about person. Clitic-combined, obsolete and compound (haber +
 * participle) forms are skipped. The grid follows the default SpanishDict learner view.
 */

export type ConjPerson = '1s' | '2s' | '3s' | '1p' | '2p' | '3p'

export type ConjTenseKey =
  | 'present' | 'preterite' | 'imperfect' | 'conditional' | 'future'
  | 'subPresent' | 'subImperfect'

export interface ConjTense {
  key: ConjTenseKey
  forms: Partial<Record<ConjPerson, string>>
}

export interface Conjugation {
  infinitive: string | null
  gerund: string | null
  pastParticiple: string | null
  indicative: ConjTense[]
  subjunctive: ConjTense[]
  imperativeAffirmative: string[]
  imperativeNegative: string[]
}

const INDICATIVE_ORDER: ConjTenseKey[] = ['present', 'preterite', 'imperfect', 'conditional', 'future']
const SUBJUNCTIVE_ORDER: ConjTenseKey[] = ['subPresent', 'subImperfect']

// Subject pronoun -> (canonical person, preference rank). Lower rank wins when a
// cell has several candidate pronouns (e.g. él beats ella/usted for 3s).
const PRONOUNS: Record<string, { person: ConjPerson; rank: number }> = {
  yo: { person: '1s', rank: 0 },
  tú: { person: '2s', rank: 0 }, tu: { person: '2s', rank: 0 }, vos: { person: '2s', rank: 1 },
  él: { person: '3s', rank: 0 }, el: { person: '3s', rank: 0 }, ella: { person: '3s', rank: 1 }, usted: { person: '3s', rank: 2 },
  nosotros: { person: '1p', rank: 0 }, nosotras: { person: '1p', rank: 1 },
  vosotros: { person: '2p', rank: 0 }, vosotras: { person: '2p', rank: 1 },
  ellos: { person: '3p', rank: 0 }, ellas: { person: '3p', rank: 1 }, ustedes: { person: '3p', rank: 2 },
}

function pronounOf(tokens: string[]): { person: ConjPerson; rank: number } | null {
  for (const t of tokens) {
    // The tokens come from a database label, so a bare lookup could answer with something
    // off Object.prototype instead of a pronoun.
    if (Object.hasOwn(PRONOUNS, t)) return PRONOUNS[t]
  }
  return null
}

/** Indicative or subjunctive tense key from a Spanish-vocabulary label, or null. Compound
 *  tenses are filtered earlier by the space in the form text, so only simple ones arrive. */
function tenseKeyOf(label: string): ConjTenseKey | null {
  if (label.includes('subjuntivo')) {
    if (label.includes('presente')) return 'subPresent'
    if (label.includes('imperfecto')) return 'subImperfect'
    return null // future subjunctive (archaic) — skip
  }
  if (label.includes('condicional')) return label.includes('presente') ? 'conditional' : null
  if (label.includes('indicativo')) {
    if (label.includes('presente')) return 'present'
    if (label.includes('perfecto-simple')) return 'preterite'
    if (label.includes('imperfecto')) return 'imperfect'
    if (label.includes('futuro')) return 'future'
  }
  return null
}

export function buildConjugation(forms: WordForm[]): Conjugation | null {
  let infinitive: string | null = null
  let gerund: string | null = null
  let pastParticiple: string | null = null
  const imperativeAffirmative: string[] = []
  const imperativeNegative: string[] = []

  // tenseKey -> person -> { form, rank }
  const cells = new Map<ConjTenseKey, Map<ConjPerson, { form: string; rank: number; variant: number }>>()

  for (const { formText, formLabel } of forms) {
    const text = formText.trim()
    if (!text) continue
    const label = (formLabel ?? '').toLowerCase().trim()
    if (!label) continue
    if (label.includes('combined-form') || label.includes('object-') ||
        label.includes('alternative') || label.includes('obsolete') ||
        label.includes('superseded') || label.includes('archaic')) continue

    // Non-finite forms (no subject pronoun)
    if (label.includes('infinitiv')) { infinitive ??= text; continue }
    if (label.includes('gerund')) { gerund ??= text; continue }
    if (label.includes('particip') && !label.includes('feminine') && !label.includes('plural')) {
      pastParticiple ??= text; continue
    }

    // Imperative (exact Spanish labels; clitic-combined ones already filtered above)
    if (label === 'imperativo afirmativo') { if (!imperativeAffirmative.includes(text)) imperativeAffirmative.push(text); continue }
    if (label === 'imperativo negativo') { if (!imperativeNegative.includes(text)) imperativeNegative.push(text); continue }

    // Compound / periphrastic tenses (haber + participle, e.g. "he hablado") are
    // two words — drop them; the learner grid shows only the simple tenses.
    if (text.includes(' ')) continue

    const key = tenseKeyOf(label)
    if (!key) continue
    const pron = pronounOf(label.split(/\s+/))
    if (!pron) continue

    // For the imperfect subjunctive, prefer the -ra variant (-1) over -se (-2).
    const variant = label.includes('imperfecto-2') ? 2 : 1

    let byPerson = cells.get(key)
    if (!byPerson) { byPerson = new Map(); cells.set(key, byPerson) }
    const existing = byPerson.get(pron.person)
    const better = !existing || variant < existing.variant ||
      (variant === existing.variant && pron.rank < existing.rank)
    if (better) byPerson.set(pron.person, { form: text, rank: pron.rank, variant })
  }

  const toTenses = (order: ConjTenseKey[]): ConjTense[] =>
    order
      .filter((k) => cells.has(k))
      .map((k) => ({
        key: k,
        forms: Object.fromEntries([...cells.get(k)!.entries()].map(([p, v]) => [p, v.form])) as Partial<Record<ConjPerson, string>>,
      }))

  const indicative = toTenses(INDICATIVE_ORDER)
  const subjunctive = toTenses(SUBJUNCTIVE_ORDER)

  const hasVerbData = Boolean(infinitive) || indicative.length > 0 || subjunctive.length > 0 ||
    imperativeAffirmative.length > 0
  if (!hasVerbData) return null

  return { infinitive, gerund, pastParticiple, indicative, subjunctive, imperativeAffirmative, imperativeNegative }
}
