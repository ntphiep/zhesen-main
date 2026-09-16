/**
 * Canonical part-of-speech grouping for the search filter UI. `lex.senses.pos` is
 * free text sourced from several pipelines, so the same category shows up under
 * different spellings per language (verified: es rows use 'adj'/'adv'/'intj'/'det'
 * while en rows spell them out as 'adjective'/'adverb'/'interjection'/'determiner').
 * Grouping them here keeps the filter chips from splitting one real category into
 * two -- see components/search/SearchBox.tsx.
 */
export interface PosGroup {
  key: string
  labelVi: string
  /** English display label ("Noun", "Verb"), used where the part of speech is
   *  shown as a short tag rather than in running Vietnamese text. */
  labelEn: string
}

const POS_GROUPS: Record<string, PosGroup> = {
  noun: { key: 'noun', labelVi: 'Danh từ', labelEn: 'Noun' },
  verb: { key: 'verb', labelVi: 'Động từ', labelEn: 'Verb' },
  adjective: { key: 'adjective', labelVi: 'Tính từ', labelEn: 'Adjective' },
  adj: { key: 'adjective', labelVi: 'Tính từ', labelEn: 'Adjective' },
  adverb: { key: 'adverb', labelVi: 'Trạng từ', labelEn: 'Adverb' },
  adv: { key: 'adverb', labelVi: 'Trạng từ', labelEn: 'Adverb' },
  pronoun: { key: 'pronoun', labelVi: 'Đại từ', labelEn: 'Pronoun' },
  pron: { key: 'pronoun', labelVi: 'Đại từ', labelEn: 'Pronoun' },
  determiner: { key: 'determiner', labelVi: 'Từ hạn định', labelEn: 'Determiner' },
  det: { key: 'determiner', labelVi: 'Từ hạn định', labelEn: 'Determiner' },
  preposition: { key: 'preposition', labelVi: 'Giới từ', labelEn: 'Preposition' },
  prep: { key: 'preposition', labelVi: 'Giới từ', labelEn: 'Preposition' },
  conjunction: { key: 'conjunction', labelVi: 'Liên từ', labelEn: 'Conjunction' },
  conj: { key: 'conjunction', labelVi: 'Liên từ', labelEn: 'Conjunction' },
  interjection: { key: 'interjection', labelVi: 'Thán từ', labelEn: 'Interjection' },
  intj: { key: 'interjection', labelVi: 'Thán từ', labelEn: 'Interjection' },
  numeral: { key: 'numeral', labelVi: 'Số từ', labelEn: 'Numeral' },
  num: { key: 'numeral', labelVi: 'Số từ', labelEn: 'Numeral' },
  name: { key: 'name', labelVi: 'Danh từ riêng', labelEn: 'Proper name' },
  article: { key: 'article', labelVi: 'Mạo từ', labelEn: 'Article' },
  character: { key: 'character', labelVi: 'Chữ Hán', labelEn: 'Character' },
  contraction: { key: 'contraction', labelVi: 'Từ viết tắt', labelEn: 'Contraction' },
  participle: { key: 'participle', labelVi: 'Phân từ', labelEn: 'Participle' },
  prefix: { key: 'prefix', labelVi: 'Tiền tố', labelEn: 'Prefix' },
  prep_phrase: { key: 'prep_phrase', labelVi: 'Cụm giới từ', labelEn: 'Prep. phrase' },
  symbol: { key: 'symbol', labelVi: 'Ký hiệu', labelEn: 'Symbol' },
  letter: { key: 'letter', labelVi: 'Chữ cái', labelEn: 'Letter' },
  phrase: { key: 'phrase', labelVi: 'Cụm từ', labelEn: 'Phrase' },
  particle: { key: 'particle', labelVi: 'Trợ từ', labelEn: 'Particle' },
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
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
  return { key, labelVi: pos, labelEn: titleCase(key) }
}
