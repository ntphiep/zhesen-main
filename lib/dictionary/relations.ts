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
 * Bucket lex relations into UI sections. The data is ~96% relation_type='derived'
 * (a catch-all with related_entry_id never populated), so derived rows are split by
 * shape: multiword or hyphenated -> compounds & phrases; single token -> derived terms.
 * synonym/antonym/related keep their own buckets.
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
