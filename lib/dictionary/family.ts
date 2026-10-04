import type { WordForm } from './types'

/**
 * The grammatical word family: an entry's inflected forms, named in Vietnamese and ordered
 * so the forms a learner needs come first. `lex.inflections.form_label` is not a closed
 * vocabulary -- it is space-separated Wiktionary tags mixing a form with usage markers
 * ("UK participle past") -- so the form takes the first matching rule and markers are
 * collected separately, which survives a combination nobody has seen yet.
 */
export interface FamilyForm {
  text: string
  /** Vietnamese name of the grammatical form, e.g. "So sánh hơn". */
  label: string
  /** Usage markers to show muted beside the form, e.g. ["cổ", "hiếm"]. */
  markers: string[]
  /** False for variants (archaic, dialectal, misspellings), which sort last. */
  standard: boolean
}

/** Ordered: the first pattern that matches the label names the form. Participle
 *  rules come before the bare "past" rule, which would otherwise swallow them. */
const FORM_NAMES: [RegExp, string][] = [
  [/simple past and past participle/, 'Quá khứ và phân từ II'],
  [/third-person singular|present singular third-person/, 'Ngôi thứ ba số ít'],
  [/second-person singular/, 'Ngôi thứ hai số ít'],
  [/participle (?:\S+ )?past|past (?:\S+ )?participle/, 'Phân từ II (quá khứ)'],
  [/participle (?:\S+ )?present|present (?:\S+ )?participle|gerund/, 'Phân từ I (-ing)'],
  [/past/, 'Quá khứ'],
  [/comparative/, 'So sánh hơn'],
  [/superlative/, 'So sánh nhất'],
  [/positive/, 'Nguyên cấp'],
  [/diminutive/, 'Dạng chỉ nhỏ'],
  [/augmentative/, 'Dạng chỉ lớn'],
  [/\bagent\b/, 'Người làm'],
  [/demonym/, 'Tên người dân'],
  [/\badverb\b/, 'Trạng từ'],
  [/reflexive/, 'Phản thân'],
  [/feminine plural/, 'Giống cái số nhiều'],
  [/masculine plural/, 'Giống đực số nhiều'],
  [/feminine/, 'Giống cái'],
  [/masculine/, 'Giống đực'],
  [/plural/, 'Số nhiều'],
  [/singular/, 'Số ít'],
  [/imperativ/, 'Mệnh lệnh'],
  [/infinitive/, 'Nguyên thể'],
  [/canonical/, 'Dạng gốc'],
  [/abbreviation/, 'Viết tắt'],
  [/uppercase/, 'Viết hoa'],
  [/lowercase/, 'Viết thường'],
  [/alternative|^or$/, 'Biến thể'],
]

const MARKERS: [RegExp, string][] = [
  [/obsolete/, 'không còn dùng'],
  [/archaic/, 'cổ'],
  [/dated/, 'cũ'],
  [/rare|uncommon/, 'hiếm'],
  [/dialectal|Scotland/, 'phương ngữ'],
  [/misspelling/, 'viết sai'],
  [/nonstandard/, 'không chuẩn'],
  [/informal/, 'thân mật'],
  [/pronunciation-spelling/, 'ghi theo phát âm'],
  [/Early Modern/, 'tiếng Anh cận đại'],
  [/\bUK\b|Commonwealth/, 'Anh-Anh'],
  [/\bUS\b/, 'Anh-Mỹ'],
  [/Canada/, 'Canada'],
]

/** A variant is a spelling someone might meet while reading but should not copy.
 *  These sort below the real inflections instead of being mixed in with them. day listed
 *  the "Internet Leet plural" dayz; 74 English entries had such a slang or joke form. */
const VARIANT = /alternative|archaic|obsolete|dated|nonstandard|misspelling|misconstruction|pronunciation-spelling|dialectal|Scotland|Early Modern|Internet|Leet|humorous|hypercorrect|slang|euphemistic|derogatory|^or$/

/** A label with no Vietnamese name is a usage note ("countable uncountable"), not a form, so
 *  it is never printed and the form sorts with the variants. */
function describe(label: string | null): { label: string; markers: string[]; standard: boolean } {
  const raw = (label ?? '').trim()
  const name = FORM_NAMES.find(([re]) => re.test(raw))?.[1]
  const markers = MARKERS.filter(([re]) => re.test(raw)).map(([, m]) => m)
  return { label: name ?? 'Dạng khác', markers, standard: !VARIANT.test(raw) && (name !== undefined || !raw) }
}

/** got and walked are "past second-person singular" as well as past: a row naming another
 *  person is the last one a spelling is named by. */
const OTHER_PERSON = /\b(?:first|second)-person\b/

/** One spelling's name from every row it has, so the order rows come back in does not
 *  matter: walked is past and past participle. Among the rest the first row wins, which
 *  leadingForms (wordView.ts) puts in the entry's leading part of speech. */
function describeRows(labels: string[]): { label: string; markers: string[]; standard: boolean } {
  const all = labels.map((raw) => ({ raw, ...describe(raw) }))
  const pool = all.some((d) => d.standard) ? all.filter((d) => d.standard) : all
  const names = new Set(pool.map((d) => d.label))
  if (names.has('Quá khứ') && names.has('Phân từ II (quá khứ)')) {
    const past = pool.find((d) => d.label === 'Quá khứ')
    return { label: 'Quá khứ và phân từ II', markers: past?.markers ?? [], standard: past?.standard ?? true }
  }
  const pick = pool.find((d) => !OTHER_PERSON.test(d.raw)) ?? pool[0]
  return { label: pick.label, markers: pick.markers, standard: pick.standard }
}

/** Spanish clitic-attached verb forms ("dígamelo"): 60+ rows per verb, and the
 *  conjugation table already covers the verb. They are not a word family. */
const NOT_A_FAMILY_MEMBER = /combined-form/

export function groupWordForms(forms: WordForm[]): FamilyForm[] {
  const bySpelling = new Map<string, string[]>()
  for (const f of forms) {
    const text = f.formText.trim()
    if (!text || NOT_A_FAMILY_MEMBER.test(f.formLabel ?? '')) continue
    bySpelling.set(text, [...(bySpelling.get(text) ?? []), (f.formLabel ?? '').trim()])
  }
  const out: FamilyForm[] = [...bySpelling].map(([text, labels]) => ({ text, ...describeRows(labels) }))
  const order = (x: FamilyForm) => {
    const i = FORM_NAMES.findIndex(([, name]) => name === x.label)
    return (x.standard ? 0 : 1000) + (i < 0 ? 500 : i)
  }
  return out.sort((a, b) => order(a) - order(b))
}
