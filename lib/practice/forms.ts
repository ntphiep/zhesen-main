import { posGroup, splitPos } from '@/lib/dictionary/pos'
import { englishForms } from './cloze'
import { shuffle, type Rand } from './shuffle'

/**
 * "Dạng từ": the learner is given a word and a form and types it: go, quá khứ đơn, went. The
 * forms come from `lex.inflections`, whose English rows also carry archaic, dialect and
 * spelling variants (goeth, yode, gwin), so only the labels below are asked, and an irregular
 * form is asked before a regular one, since that is where a learner goes wrong.
 */

export interface FormCue {
  key: string
  labels: readonly string[]
  vi: string
  /** The part-of-speech groups (`lib/dictionary/pos.ts`) that take this form. */
  pos: readonly string[]
}

export const FORM_CUES: readonly FormCue[] = [
  { key: 'past', labels: ['past'], vi: 'quá khứ đơn', pos: ['verb'] },
  { key: 'pp', labels: ['past participle'], vi: 'quá khứ phân từ', pos: ['verb'] },
  { key: 'ing', labels: ['present participle'], vi: 'V-ing', pos: ['verb'] },
  { key: 's3', labels: ['present singular third-person', 'indicative present singular third-person'], vi: 'ngôi thứ ba số ít', pos: ['verb'] },
  { key: 'plural', labels: ['plural'], vi: 'số nhiều', pos: ['noun'] },
  { key: 'comparative', labels: ['comparative'], vi: 'so sánh hơn', pos: ['adjective', 'adverb'] },
  { key: 'superlative', labels: ['superlative'], vi: 'so sánh nhất', pos: ['adjective', 'adverb'] },
]

/** The cues for the first inflecting part of speech the learner saved: "spot" saved as
 *  "noun,verb" with a noun meaning asks for "spots" as a plural, never as a verb form. */
function cuesFor(pos: string | null | undefined): readonly FormCue[] {
  const groups = splitPos(pos).map((p) => posGroup(p)?.key)
  const first = groups.find((g) => g && FORM_CUES.some((c) => c.pos.includes(g)))
  if (first) return FORM_CUES.filter((c) => c.pos.includes(first))
  return groups.length > 0 ? [] : FORM_CUES
}

export interface FormQuestion {
  cue: string
  /** Every spelling the source gives for that form: learned and learnt. */
  answers: string[]
  irregular: boolean
}

const WORD = /^\p{L}+(?:['-]\p{L}+)*$/u

function regular(headword: string): Set<string> {
  const w = headword.toLowerCase()
  const out = new Set(englishForms(w))
  for (const suffix of ['er', 'r', 'est', 'st']) out.add(`${w}${suffix}`)
  if (/[^aeiou]y$/.test(w)) out.add(`${w.slice(0, -1)}ier`).add(`${w.slice(0, -1)}iest`)
  if (/[^aeiou][aeiou][bdgmnpt]$/.test(w)) out.add(`${w}${w.at(-1)}er`).add(`${w}${w.at(-1)}est`)
  return out
}

/** One form of an English word to ask for, or null when the source lists none worth asking. */
export function pickFormQuestion(
  headword: string, forms: readonly { text: string; label: string | null }[], rand: Rand = Math.random, pos: string | null = null,
): FormQuestion | null {
  const base = headword.trim().toLowerCase()
  if (!WORD.test(base)) return null
  const regulars = regular(base)
  const questions: FormQuestion[] = []
  for (const cue of cuesFor(pos)) {
    const answers = [...new Set(forms
      .filter((f) => f.label && cue.labels.includes(f.label.trim().toLowerCase()))
      .map((f) => f.text.trim())
      .filter((t) => WORD.test(t) && t.toLowerCase() !== base))]
    if (answers.length === 0) continue
    questions.push({ cue: cue.vi, answers, irregular: answers.some((a) => !regulars.has(a.toLowerCase())) })
  }
  const order = shuffle(questions, rand)
  return order.find((q) => q.irregular) ?? order[0] ?? null
}
