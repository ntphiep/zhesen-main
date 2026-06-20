import type { WordForm } from './types'

/**
 * The grammatical word family = distinct inflected forms of the entry, first-seen
 * order. This is the only data source for word forms (develop/develops/developing
 * etc. are not separate entries, and relations carry no entry links).
 */
export function groupWordForms(forms: WordForm[]): string[] {
  return [...new Set(forms.map((f) => f.formText.trim()).filter(Boolean))]
}
