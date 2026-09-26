import type { DictRelation } from './types'

export interface ClassifiedRelations {
  synonyms: string[]
  antonyms: string[]
  derived: string[]
  compounds: string[]
  related: string[]
  broader: string[]
  narrower: string[]
  sameKind: string[]
}

/** Words shown per section before the reader expands it. */
export const RELATION_CAP = 8

const uniq = (xs: string[]) => [...new Set(xs)]

/**
 * Bucket lex relations into UI sections. The WordNet types (hypernym, hyponym, meronym,
 * holonym, coordinate, similar, also) get their own sections; `derived` and any other
 * type split by shape: multiword or hyphenated to compounds and phrases, a single token
 * stays a derived term. The target is matched by text.
 */
export function classifyRelations(relations: DictRelation[]): ClassifiedRelations {
  const out: ClassifiedRelations = {
    synonyms: [], antonyms: [], derived: [], compounds: [], related: [],
    broader: [], narrower: [], sameKind: [],
  }
  for (const r of relations) {
    const text = r.relatedText?.trim()
    if (!text) continue
    switch (r.relationType) {
      case 'synonym': out.synonyms.push(text); break
      case 'antonym': out.antonyms.push(text); break
      case 'related': out.related.push(text); break
      case 'hypernym': case 'holonym': out.broader.push(text); break
      case 'hyponym': case 'meronym': out.narrower.push(text); break
      case 'coordinate': case 'similar': case 'also': out.sameKind.push(text); break
      default: (/[\s-]/.test(text) ? out.compounds : out.derived).push(text)
    }
  }
  return {
    synonyms: uniq(out.synonyms), antonyms: uniq(out.antonyms), derived: uniq(out.derived),
    compounds: uniq(out.compounds), related: uniq(out.related),
    broader: uniq(out.broader), narrower: uniq(out.narrower), sameKind: uniq(out.sameKind),
  }
}

/** The related words shown before expanding, which are the only ones worth a preview
 *  lookup: en:head has 1,569 relations, and previewing all of them took 1.85 s against
 *  the anon role's 3 s statement timeout. */
export function previewedRelationTexts(relations: DictRelation[]): string[] {
  return Object.values(classifyRelations(relations)).flatMap((xs) => xs.slice(0, RELATION_CAP))
}
