import type { WordForm } from './types'

/**
 * The grammatical word family: the inflected forms of an entry, named in
 * Vietnamese and ordered so the forms a learner needs come first.
 *
 * The data already knows what each form is -- `lex.inflections.form_label` says
 * "comparative", "participle past", "alternative dialectal" -- but the page used
 * to render the bare `form_text` and drop the label. For "smooth" that produced
 * eight identical chips in which "smoothed" (the past participle) sat beside
 * "smeeth" (a dialect form nobody writes) with nothing to tell them apart.
 *
 * The labels are not a closed vocabulary. They are space-separated tags from
 * Wiktionary, mixing a grammatical form with usage markers: "alternative archaic
 * rare", "UK participle past", "nonstandard plural". So the form is matched by
 * the first rule that fits and the markers are collected separately, which keeps
 * working when the pipeline emits a combination nobody has seen yet.
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
  [/simple past and past participle/, 'Quá khứ & phân từ II'],
  [/third-person singular|present singular third-person/, 'Ngôi thứ ba số ít'],
  [/second-person singular/, 'Ngôi thứ hai số ít'],
  [/participle past|past participle/, 'Phân từ II (quá khứ)'],
  [/participle present|present participle|gerund/, 'Phân từ I (-ing)'],
  [/past/, 'Quá khứ'],
  [/comparative/, 'So sánh hơn'],
  [/superlative/, 'So sánh nhất'],
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
 *  These sort below the real inflections instead of being mixed in with them. */
const VARIANT = /alternative|archaic|obsolete|dated|nonstandard|misspelling|dialectal|Scotland|Early Modern|^or$/

function describe(label: string | null): { label: string; markers: string[]; standard: boolean } {
  const raw = (label ?? '').trim()
  const name = FORM_NAMES.find(([re]) => re.test(raw))?.[1]
  const markers = MARKERS.filter(([re]) => re.test(raw)).map(([, m]) => m)
  return {
    label: name ?? (raw ? raw[0].toUpperCase() + raw.slice(1) : 'Dạng khác'),
    markers,
    standard: !VARIANT.test(raw),
  }
}

/** Spanish clitic-attached verb forms ("dígamelo"): 60+ rows per verb, and the
 *  conjugation table already covers the verb. They are not a word family. */
const NOT_A_FAMILY_MEMBER = /combined-form/

export function groupWordForms(forms: WordForm[]): FamilyForm[] {
  const seen = new Set<string>()
  const out: FamilyForm[] = []
  for (const f of forms) {
    const text = f.formText.trim()
    if (!text || seen.has(text)) continue
    if (NOT_A_FAMILY_MEMBER.test(f.formLabel ?? '')) continue
    seen.add(text)
    out.push({ text, ...describe(f.formLabel) })
  }
  const order = (x: FamilyForm) => {
    const i = FORM_NAMES.findIndex(([, name]) => name === x.label)
    return (x.standard ? 0 : 1000) + (i < 0 ? 500 : i)
  }
  return out.sort((a, b) => order(a) - order(b))
}
