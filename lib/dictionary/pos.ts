/**
 * Canonical part-of-speech grouping for the search filter. `lex.senses.pos` is free text
 * from several pipelines, so one category has different spellings per language: es rows use
 * 'adj'/'adv'/'intj'/'det' where en rows write them out. Without grouping, the filter chips
 * split one real category in two.
 */
export interface PosGroup {
  key: string
  labelVi: string
}

const POS_GROUPS: Record<string, PosGroup> = {
  noun: { key: 'noun', labelVi: 'Danh từ' },
  verb: { key: 'verb', labelVi: 'Động từ' },
  adjective: { key: 'adjective', labelVi: 'Tính từ' },
  adj: { key: 'adjective', labelVi: 'Tính từ' },
  adverb: { key: 'adverb', labelVi: 'Trạng từ' },
  adv: { key: 'adverb', labelVi: 'Trạng từ' },
  pronoun: { key: 'pronoun', labelVi: 'Đại từ' },
  pron: { key: 'pronoun', labelVi: 'Đại từ' },
  determiner: { key: 'determiner', labelVi: 'Từ hạn định' },
  det: { key: 'determiner', labelVi: 'Từ hạn định' },
  preposition: { key: 'preposition', labelVi: 'Giới từ' },
  prep: { key: 'preposition', labelVi: 'Giới từ' },
  conjunction: { key: 'conjunction', labelVi: 'Liên từ' },
  conj: { key: 'conjunction', labelVi: 'Liên từ' },
  interjection: { key: 'interjection', labelVi: 'Thán từ' },
  intj: { key: 'interjection', labelVi: 'Thán từ' },
  numeral: { key: 'numeral', labelVi: 'Số từ' },
  num: { key: 'numeral', labelVi: 'Số từ' },
  name: { key: 'name', labelVi: 'Danh từ riêng' },
  article: { key: 'article', labelVi: 'Mạo từ' },
  character: { key: 'character', labelVi: 'Chữ Hán' },
  contraction: { key: 'contraction', labelVi: 'Từ viết tắt' },
  participle: { key: 'participle', labelVi: 'Phân từ' },
  prefix: { key: 'prefix', labelVi: 'Tiền tố' },
  prep_phrase: { key: 'prep_phrase', labelVi: 'Cụm giới từ' },
  symbol: { key: 'symbol', labelVi: 'Ký hiệu' },
  letter: { key: 'letter', labelVi: 'Chữ cái' },
  phrase: { key: 'phrase', labelVi: 'Cụm từ' },
  particle: { key: 'particle', labelVi: 'Trợ từ' },
}

/** Map a raw `pos` value to its canonical group, falling back to the raw value
 * itself (title-cased passthrough) for anything not in the table above so an
 * unexpected future pos still shows up rather than silently disappearing. */
export function posGroup(pos: string | null | undefined): PosGroup | null {
  if (!pos) return null
  const key = pos.trim().toLowerCase()
  if (!key) return null
  // Object.hasOwn rather than a bare lookup: `pos` comes from the database, and
  // POS_GROUPS['constructor'] answers with Object.prototype.constructor, which is
  // truthy enough to defeat `??` and leaves every label on the row undefined.
  if (Object.hasOwn(POS_GROUPS, key)) return POS_GROUPS[key]
  return { key, labelVi: pos }
}
