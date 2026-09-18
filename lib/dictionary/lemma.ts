import type { DictSense } from './types'

/**
 * The dictionary word an inflected entry belongs to. Wiktionary files every inflected form
 * as its own entry whose only gloss is a pointer ("plural of person"), so the lemma is
 * extracted from that gloss. The word it points at is not always an entry, and those must
 * render as plain text rather than a link that would 404.
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
