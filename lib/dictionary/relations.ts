import type { DictRelation } from './types'

export interface ClassifiedRelations {
  collocations: string[]
  synonyms: string[]
  antonyms: string[]
  derived: string[]
  compounds: string[]
  related: string[]
  broader: string[]
  narrower: string[]
  sameKind: string[]
}

/** The Vietnamese name and hint of each bucket, in reading order. */
export const RELATION_SECTIONS: { key: keyof ClassifiedRelations; label: string; hint: string }[] = [
  { key: 'collocations', label: 'Kết hợp từ', hint: 'Cụm thường dùng với từ này' },
  { key: 'synonyms', label: 'Cận nghĩa', hint: 'Dùng thay được trong một số ngữ cảnh' },
  { key: 'antonyms', label: 'Trái nghĩa', hint: 'Nghĩa ngược lại' },
  { key: 'derived', label: 'Phái sinh', hint: 'Từ tạo ra từ gốc này' },
  { key: 'compounds', label: 'Từ ghép và cụm từ', hint: 'Cụm cố định chứa từ này' },
  // Wiktionary's "Related terms" mix words of one root ("holy" lists halidom and hallow) with
  // thesaurus entries (run lists speedy, way and rush), so the label claims neither.
  { key: 'related', label: 'Từ liên quan', hint: 'Liên quan về nghĩa hoặc nguồn gốc' },
  { key: 'broader', label: 'Khái niệm rộng hơn', hint: 'Loại lớn hơn hoặc tổng thể chứa nó' },
  { key: 'narrower', label: 'Khái niệm hẹp hơn', hint: 'Loại cụ thể hơn hoặc bộ phận của nó' },
  { key: 'sameKind', label: 'Cùng nhóm', hint: 'Cùng loại hoặc gần nghĩa' },
]

/** Words shown per section before the reader expands it. */
export const RELATION_CAP = 8

const uniq = (xs: string[]) => [...new Set(xs)]

/** Wiktionary headings and cross-references the import kept as words: "Informal and slang
 *  terms" under take, "vasoactive § Related terms", "See: Thesaurus:remote place": 2,003
 *  production rows over 1,805 entries on 2026-09-27. "see to" and "see red" are real phrases. */
const WIKTIONARY_NOTE =
  /§|\b(?:Thesaurus|Appendix):|\bWiktionary\b|^(?:more at|see at|see (?:many )?others|for more see|also:)\s|^(?:Formal|Informal and slang) terms$|^Like other \w+ words$/i

/**
 * Bucket lex relations into UI sections. The WordNet types (hypernym, hyponym, meronym,
 * holonym, coordinate, similar, also) get their own sections; `derived` and any other
 * type split by shape: multiword or hyphenated to compounds and phrases, a single token
 * stays a derived term. The target is matched by text.
 */
export function classifyRelations(relations: DictRelation[]): ClassifiedRelations {
  const out: ClassifiedRelations = {
    collocations: [], synonyms: [], antonyms: [], derived: [], compounds: [], related: [],
    broader: [], narrower: [], sameKind: [],
  }
  for (const r of relations) {
    const text = r.relatedText?.trim()
    if (!text || WIKTIONARY_NOTE.test(text)) continue
    switch (r.relationType) {
      case 'collocation': out.collocations.push(text); break
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
    collocations: uniq(out.collocations), synonyms: uniq(out.synonyms), antonyms: uniq(out.antonyms), derived: uniq(out.derived),
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
