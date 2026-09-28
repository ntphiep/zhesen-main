/**
 * Canonical part-of-speech grouping. `lex.senses.pos` is free text from several
 * pipelines, so one category has different spellings per language: es rows use
 * 'adj'/'adv'/'intj'/'det' where en rows write them out. Without grouping, the filter
 * chips split one real category in two.
 *
 * `abbr` is what the product shows; `labelVi` is the expansion behind it. Tables render
 * the abbreviation, so a column holds one line; the word page spells it out, where there
 * is room. `components/ui/PosTag.tsx` pairs the two.
 */
export interface PosGroup {
  key: string
  abbr: string
  labelVi: string
}

const POS_GROUPS: Record<string, PosGroup> = {
  noun: { key: 'noun', abbr: 'n.', labelVi: 'Danh từ' },
  verb: { key: 'verb', abbr: 'v.', labelVi: 'Động từ' },
  adjective: { key: 'adjective', abbr: 'adj.', labelVi: 'Tính từ' },
  adj: { key: 'adjective', abbr: 'adj.', labelVi: 'Tính từ' },
  adverb: { key: 'adverb', abbr: 'adv.', labelVi: 'Trạng từ' },
  adv: { key: 'adverb', abbr: 'adv.', labelVi: 'Trạng từ' },
  pronoun: { key: 'pronoun', abbr: 'pron.', labelVi: 'Đại từ' },
  pron: { key: 'pronoun', abbr: 'pron.', labelVi: 'Đại từ' },
  determiner: { key: 'determiner', abbr: 'det.', labelVi: 'Từ hạn định' },
  det: { key: 'determiner', abbr: 'det.', labelVi: 'Từ hạn định' },
  preposition: { key: 'preposition', abbr: 'prep.', labelVi: 'Giới từ' },
  prep: { key: 'preposition', abbr: 'prep.', labelVi: 'Giới từ' },
  conjunction: { key: 'conjunction', abbr: 'conj.', labelVi: 'Liên từ' },
  conj: { key: 'conjunction', abbr: 'conj.', labelVi: 'Liên từ' },
  interjection: { key: 'interjection', abbr: 'interj.', labelVi: 'Thán từ' },
  intj: { key: 'interjection', abbr: 'interj.', labelVi: 'Thán từ' },
  numeral: { key: 'numeral', abbr: 'num.', labelVi: 'Số từ' },
  num: { key: 'numeral', abbr: 'num.', labelVi: 'Số từ' },
  name: { key: 'name', abbr: 'prop.', labelVi: 'Danh từ riêng' },
  proper_noun: { key: 'name', abbr: 'prop.', labelVi: 'Danh từ riêng' },
  article: { key: 'article', abbr: 'art.', labelVi: 'Mạo từ' },
  character: { key: 'character', abbr: 'char.', labelVi: 'Chữ Hán' },
  contraction: { key: 'contraction', abbr: 'contr.', labelVi: 'Từ viết tắt' },
  participle: { key: 'participle', abbr: 'ptcp.', labelVi: 'Phân từ' },
  prefix: { key: 'prefix', abbr: 'pref.', labelVi: 'Tiền tố' },
  prep_phrase: { key: 'prep_phrase', abbr: 'prep.ph.', labelVi: 'Cụm giới từ' },
  symbol: { key: 'symbol', abbr: 'sym.', labelVi: 'Ký hiệu' },
  letter: { key: 'letter', abbr: 'ltr.', labelVi: 'Chữ cái' },
  phrase: { key: 'phrase', abbr: 'ph.', labelVi: 'Cụm từ' },
  particle: { key: 'particle', abbr: 'part.', labelVi: 'Trợ từ' },
}

/** Map a raw `pos` value to its canonical group, falling back to the raw value
 * itself for anything not in the table above so an unexpected future pos still shows
 * up rather than silently disappearing. */
export function posGroup(pos: string | null | undefined): PosGroup | null {
  if (!pos) return null
  const key = pos.trim().toLowerCase()
  if (!key) return null
  // Object.hasOwn rather than a bare lookup: `pos` comes from the database, and
  // POS_GROUPS['constructor'] answers with Object.prototype.constructor, which is
  // truthy enough to defeat `??` and leaves every label on the row undefined.
  if (Object.hasOwn(POS_GROUPS, key)) return POS_GROUPS[key]
  return { key, abbr: pos, labelVi: pos }
}

/** The distinct groups of a list of raw `pos` values, in the order first seen. A word is
 *  several parts of speech at once far more often than not: 115,891 of 146,071 English
 *  senses carry a pos, and one entry's senses regularly disagree. */
export function posGroups(values: (string | null | undefined)[]): PosGroup[] {
  const byKey = new Map<string, PosGroup>()
  for (const v of values) {
    const g = posGroup(v)
    if (g && !byKey.has(g.key)) byKey.set(g.key, g)
  }
  return [...byKey.values()]
}

/** The stored form of several parts of speech on one word. `public.user_words.pos` is a
 *  single text column, so a word that is both a noun and a verb is written `noun,verb`. */
export const POS_SEPARATOR = ','

export function splitPos(pos: string | null | undefined): string[] {
  return (pos ?? '').split(POS_SEPARATOR).map((p) => p.trim()).filter(Boolean)
}

/** The stored value as `PosTag` draws it ("n. · v."), for a text input. */
export function formatPos(pos: string | null | undefined): string {
  return posGroups(splitPos(pos)).map((g) => g.abbr).join(' · ')
}

const KEY_BY_ABBR = new Map(Object.values(POS_GROUPS).map((g) => [g.abbr.toLowerCase(), g.key]))

/** The inverse of `formatPos`: an abbreviation becomes its stored key, anything else
 *  is kept as typed. A comma separates as well as the dot. */
export function parsePos(text: string): string | null {
  const parts = text.split(/[·,]/).map((p) => p.trim()).filter(Boolean)
    .map((p) => KEY_BY_ABBR.get(p.toLowerCase()) ?? p)
  return parts.length > 0 ? [...new Set(parts)].join(POS_SEPARATOR) : null
}

/** Several senses' `pos` values as one stored string, most-used first. Matches what
 *  `lex.entry_pos` (migration 0045) returns, so a preview built by either route reads
 *  the same: `tentative` is an adjective in three senses and a noun in two, and the
 *  adjective is what the word is. */
export function joinPos(values: (string | null | undefined)[]): string | null {
  const counts = new Map<string, { n: number; first: number }>()
  values.forEach((v, i) => {
    const g = posGroup(v)
    if (!g) return
    const seen = counts.get(g.key)
    if (seen) seen.n++
    else counts.set(g.key, { n: 1, first: i })
  })
  const keys = [...counts.entries()]
    .sort((a, b) => b[1].n - a[1].n || a[1].first - b[1].first)
    .map(([key]) => key)
  return keys.length > 0 ? keys.join(POS_SEPARATOR) : null
}
