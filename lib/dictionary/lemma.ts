import type { DictSense } from './types'

/**
 * The dictionary word an inflected entry belongs to.
 *
 * Wiktionary files every inflected form as its own entry whose only gloss is a
 * pointer: "simple past and past participle of adjourn", "plural of person".
 * The page printed that sentence and stopped there, so a learner who looked up
 * "adjourned" got two lines of English and no way to reach the verb itself.
 *
 * Measured on the English entries: 5,322 carry a gloss of this shape, and 4,761
 * of the words they point at are already entries of their own. The remaining 561
 * (adjourn among them) are simply not in the dictionary yet; those render as
 * plain text rather than a link that would 404.
 */
const LEMMA_RE =
  /\b(?:plural|singular|past|participle|gerund|comparative|superlative|present|third-person|second-person|inflection|form|alternative (?:form|spelling)|misspelling)\b[^.;:]*?\bof\s+([\p{L}][\p{L}''’-]*)/iu

/** The headword this entry is a form of, or null when it is a word in its own right. */
export function lemmaFromSenses(senses: DictSense[], headword: string): string | null {
  for (const s of senses) {
    const m = s.glossEn?.match(LEMMA_RE)
    const lemma = m?.[1]?.trim()
    // A gloss that points back at the headword ("plural of sheep") says nothing:
    // the learner is already on that page.
    if (lemma && lemma.toLowerCase() !== headword.toLowerCase()) return lemma
  }
  return null
}
