import type { DictRelation } from './types'

export interface ClassifiedRelations {
  synonyms: string[]
  antonyms: string[]
  derived: string[]
  compounds: string[]
  related: string[]
}

const uniq = (xs: string[]) => [...new Set(xs)]

/**
 * Bucket lex relations into UI sections. Counted over all 101,888 rows: related 52.6%,
 * synonym 34.4%, derived 6.9%, antonym 6.1%. `related_entry_id` is null on every row, so
 * the target is matched by text. `derived` splits by shape: multiword or hyphenated to
 * compounds and phrases, a single token stays a derived term.
 */
export function classifyRelations(relations: DictRelation[]): ClassifiedRelations {
  const out: ClassifiedRelations = { synonyms: [], antonyms: [], derived: [], compounds: [], related: [] }
  for (const r of relations) {
    const text = r.relatedText?.trim()
    if (!text) continue
    switch (r.relationType) {
      case 'synonym': out.synonyms.push(text); break
      case 'antonym': out.antonyms.push(text); break
      case 'related': out.related.push(text); break
      default: (/[\s-]/.test(text) ? out.compounds : out.derived).push(text)
    }
  }
  return {
    synonyms: uniq(out.synonyms), antonyms: uniq(out.antonyms), derived: uniq(out.derived),
    compounds: uniq(out.compounds), related: uniq(out.related),
  }
}
