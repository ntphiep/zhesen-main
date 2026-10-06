import { isCleanExample } from '@/lib/dictionary/textQuality'
import type { LangCode } from '@/lib/languages'

/**
 * "Điền vào câu": a sentence with the saved word taken out, typed back in. Filling a gap in
 * context fixes a word better than choosing its definition (Laufer and Hulstijn's involvement
 * load; the Productive Vocabulary Levels Test is built the same way), and the sentence holds
 * the word in the form it takes there, so "She gave up smoking" asks for "gave up".
 */

export interface ClozeSentence {
  text: string
  translationVi: string | null
}

export interface ClozeGap {
  before: string
  /** The word as the sentence writes it: an inflected form, or a phrase with its object. */
  answer: string
  after: string
  translationVi: string | null
}

/** Long enough to give context, short enough to read in one look. */
const MAX_SENTENCE = 160
/** Words (characters for Chinese) the sentence must keep beside the gap. */
const MIN_CONTEXT = 2

/** Idiom placeholders and what a sentence writes in their place. */
const PLACEHOLDERS: Record<string, string> = {
  "one's": "(?:my|your|his|her|its|our|their|one's|someone's)",
  "someone's": "(?:my|your|his|her|its|our|their|[\\p{L}]+'s)",
  someone: '(?:\\p{L}+(?: \\p{L}+)?)',
  somebody: '(?:\\p{L}+(?: \\p{L}+)?)',
  something: '(?:\\p{L}+(?: \\p{L}+)?)',
  oneself: '(?:myself|yourself|himself|herself|itself|ourselves|yourselves|themselves|oneself)',
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Regular English forms of a word, for an entry the source lists none for. */
export function englishForms(word: string): string[] {
  const w = word.toLowerCase()
  const out = [`${w}s`, `${w}es`, `${w}ed`, `${w}d`, `${w}ing`]
  if (w.endsWith('e')) out.push(`${w.slice(0, -1)}ing`)
  if (/[^aeiou]y$/.test(w)) out.push(`${w.slice(0, -1)}ies`, `${w.slice(0, -1)}ied`)
  if (/[^aeiou][aeiou][bdgklmnprt]$/.test(w)) out.push(`${w}${w.at(-1)}ed`, `${w}${w.at(-1)}ing`)
  return out
}

/** Every spelling the word may take in a sentence: the headword, the forms the dictionary
 *  lists and, for English, the regular ones of its first word ("gives up", "giving up"). */
export function clozeForms(headword: string, lang: LangCode, listed: readonly string[]): string[] {
  const forms = new Set([headword, ...listed].map((f) => f.trim()).filter(Boolean))
  if (lang === 'en') {
    const [first, ...rest] = headword.trim().split(/\s+/)
    for (const f of englishForms(first)) forms.add([f, ...rest].join(' '))
  }
  return [...forms].sort((a, b) => b.length - a.length)
}

function pattern(form: string, lang: LangCode): RegExp {
  if (lang === 'zh') return new RegExp(escape(form), 'u')
  const words = form.split(/\s+/).map((w) => PLACEHOLDERS[w.toLowerCase()] ?? escape(w))
  return new RegExp(`(?<![\\p{L}\\p{M}'’-])${words.join('\\s+')}(?![\\p{L}\\p{M}])`, 'iu')
}

/** The first sentence that holds one of `forms`, with that form cut out. */
export function findGap(sentences: readonly ClozeSentence[], forms: readonly string[], lang: LangCode): ClozeGap | null {
  for (const s of sentences) {
    const text = s.text.trim()
    if (!text || text.length > MAX_SENTENCE || !isCleanExample(text)) continue
    for (const form of forms) {
      const m = pattern(form, lang).exec(text)
      if (!m) continue
      // "took shape" leaves one word to read the gap from, which is a guess, not a recall.
      const rest = text.replace(m[0], ' ')
      const context = lang === 'zh' ? rest.replace(/[\p{P}\s]/gu, '').length : rest.split(/[\s\p{P}]+/u).filter(Boolean).length
      if (context < MIN_CONTEXT) continue
      return {
        before: text.slice(0, m.index),
        answer: m[0],
        after: text.slice(m.index + m[0].length),
        translationVi: s.translationVi,
      }
    }
  }
  return null
}
