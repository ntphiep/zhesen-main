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
/** Also spelled out in `lex.pointer_lemma` (supabase/migrations/0080_entries_form_of.sql),
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

/** The headword this entry is a form of, or null when it is a word in its own right. */
export function lemmaFromSenses(senses: DictSense[], headword: string): string | null {
  for (const [i, s] of senses.slice(0, LAST_POINTER_SENSE).entries()) {
    const m = s.glossEn?.match(POINTER_RE)
    if (!m || (i > 0 && !INFLECTION_RE.test(m[1]))) continue
    const lemma = m[2].trim()
    // A gloss that points back at the headword ("plural of sheep") says nothing:
    // the learner is already on that page.
    if (lemma.toLowerCase() !== headword.toLowerCase()) return lemma
  }
  return null
}
