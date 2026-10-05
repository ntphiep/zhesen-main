import { isOldSense } from './textQuality'
import type { DictSense } from './types'

/**
 * The dictionary word an inflected entry belongs to. Wiktionary files every inflected form
 * as its own entry whose only gloss is a pointer ("plural of person"), so the lemma is
 * extracted from that gloss. The word it points at is not always an entry, and those must
 * render as plain text rather than a link that would 404.
 *
 * A pointer is made only of grammar words up to "of"; elsewhere they are prose ("A form of"
 * opens 2,986 English glosses). A spelling pointer counts only as sense 1: sense 30 of
 * en:give is "Alternative form of gyve.". Nothing after sense 15 counts: over the 500
 * commonest English words, 7 of the 8 found there are homographs no learner means, such as
 * run (rin) at sense 118; the eighth is bit (bite).
 */
const LAST_POINTER_SENSE = 15
/** Also spelled out in `lex.pointer_lemma` (supabase/migrations/0190_form_of_lead_part_of_speech.sql),
 *  which hides forms from the level lists; test/dictionary-lemma-sql.test.ts keeps both equal. */
export const POINTER_WORDS = [
  'simple', 'past', 'present', 'future', 'participle', 'gerund', 'comparative', 'superlative',
  'degree', 'first-person', 'second-person', 'third-person', 'singular', 'plural', 'indicative',
  'subjunctive', 'imperative', 'preterite', 'imperfect', 'conditional', 'affirmative', 'negative',
  'formal', 'informal', 'feminine', 'masculine', 'neuter', 'remote', 'inflection', 'and', 'or',
  'form', 'alternative', 'spelling', 'misspelling', 'obsolete', 'archaic', 'dated', 'nonstandard',
  'rare', 'standard', 'british', 'uk', 'us', 'letter-case', 'pronunciation',
]
export const INFLECTION_WORDS = [
  'plural', 'singular', 'past', 'present', 'future', 'participle', 'gerund', 'comparative',
  'superlative', 'person', 'indicative', 'subjunctive', 'imperative', 'preterite', 'imperfect',
  'conditional', 'inflection',
]
const POINTER_RE = new RegExp(String.raw`^((?:(?:${POINTER_WORDS.join('|')}|\([^)]*\))\s+)+)of\s+([\p{L}][\p{L}''’-]*)`, 'iu')
const INFLECTION_RE = new RegExp(String.raw`\b(?:${INFLECTION_WORDS.join('|')})\b`, 'i')

const FORM_LINE_RE = new RegExp(String.raw`^(?:(?:${POINTER_WORDS.join('|')}|\([^)]*\))[\s.,;]*)+$`, 'iu')
/** Words after the pointed-at word that run on to the end of the gloss. */
const RUN_ON_RE = /^((?:\s+[\p{L}][\p{L}''’-]*)+)\s*[.;:)]*\s*$/u

/** The lemma a pointer match names. fed up's "simple past and past participle of feed up"
 *  names feed up, not feed: a headword of several words takes as many from the gloss. */
function pointedAt(gloss: string, m: RegExpMatchArray, headword: string): string {
  const first = m[2].trim()
  const words = headword.trim().split(/\s+/).length
  if (words < 2) return first
  const rest = gloss.slice((m.index ?? 0) + m[0].length).match(RUN_ON_RE)?.[1].trim().split(/\s+/) ?? []
  return rest.length === words - 1 ? [first, ...rest].join(' ') : first
}

/** The word the sense at `index` (dictionary order, from 0) points at: "plural of person"
 *  and Wiktionary's heading "inflection of casar:" name person and casar. It needs a grammar
 *  word before "of", since a label alone is a definition: CC-CEDICT's "(idiom) of long
 *  standing" is not a form of long. The limits of lemmaFromSenses hold too. English and
 *  Spanish only. */
export function pointerLemma(glossEn: string | null, index = 0): string | null {
  if (index >= LAST_POINTER_SENSE) return null
  const m = glossEn?.match(POINTER_RE)
  if (!m || !m[1].replace(/\([^)]*\)/g, '').trim() || (index > 0 && !INFLECTION_RE.test(m[1]))) return null
  return m[2].trim()
}

/** The lemma of a form line: a gloss made only of grammar words that follows, in the same
 *  part of speech, a heading ending in ":" (casa's "third-person singular present
 *  indicative" under "inflection of casar:"). `senses` is in dictionary order. */
export function formLineLemma(senses: DictSense[], index: number): string | null {
  const s = senses[index]
  if (!s?.glossEn || !FORM_LINE_RE.test(s.glossEn.trim())) return null
  for (let i = index - 1; i >= 0; i--) {
    const prev = senses[i]
    if (prev.pos !== s.pos) return null
    const gloss = prev.glossEn?.trim() ?? ''
    if (/:$/.test(gloss)) return pointerLemma(gloss, i)
    if (!FORM_LINE_RE.test(gloss)) return null
  }
  return null
}

const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** A gloss ending in "of <lemma>", as "plural of hora" and "simple past of take off" do. */
const ofLemma = (lemma: string) => new RegExp(String.raw`\bof\s+${escapeRe(lemma)}\s*[.;:)]*\s*$`, 'iu')

/** Whether every sense that is not old points at `lemma`, the rule of migration 0131: emitted,
 *  or went past its obsolete noun. better has verb and noun senses of its own and keeps its
 *  page; so does sobre, a preposition that `form_of` records as a form of sobrar. */
export function isFormOnly(senses: DictSense[], lemma: string): boolean {
  const pointer = ofLemma(lemma)
  const own = [...senses.entries()].filter(([, s]) => !isOldSense(s))
  return own.length > 0 && own.every(([i, s]) => pointer.test(s.glossEn?.trim() ?? '')
    || formLineLemma(senses, i)?.toLowerCase() === lemma.toLowerCase())
}

/** What the form is, in the words of its pointer sense's Vietnamese gloss up to the lemma:
 *  emitted's "quá khứ và phân từ quá khứ của emit" gives "quá khứ và phân từ quá khứ của". */
export function formNoteVi(senses: DictSense[], lemma: string): string {
  const tail = new RegExp(String.raw`\s+${escapeRe(lemma)}\s*$`, 'iu')
  for (const [i, s] of senses.entries()) {
    if (pointerLemma(s.glossEn, i) === null || !ofLemma(lemma).test(s.glossEn?.trim() ?? '')) continue
    const note = (s.glossVi ?? '').trim().replace(tail, '')
    if (note && /\scủa$/u.test(note)) return note.charAt(0).toLocaleLowerCase('vi') + note.slice(1)
  }
  return 'một dạng của'
}

/** The headword this entry is a form of, or null when it is a word in its own right. A
 *  pointer counts only in the part of speech of the first sense that is not obsolete or
 *  vulgar: casa is a noun whose verb senses are forms of casar, and went's first sense is
 *  the obsolete noun "a path". */
export function lemmaFromSenses(senses: DictSense[], headword: string): string | null {
  const lead = senses.find((s) => !isOldSense(s)) ?? senses[0]
  for (const [i, s] of senses.slice(0, LAST_POINTER_SENSE).entries()) {
    if (s.pos !== lead.pos) continue
    const m = s.glossEn?.match(POINTER_RE)
    if (!m || (i > 0 && !INFLECTION_RE.test(m[1]))) continue
    const lemma = pointedAt(s.glossEn ?? '', m, headword)
    // A gloss that points back at the headword ("plural of sheep") says nothing:
    // the learner is already on that page.
    if (lemma.toLowerCase() !== headword.toLowerCase()) return lemma
  }
  return null
}
