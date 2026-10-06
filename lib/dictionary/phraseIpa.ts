import { pickAccentRows } from './pronunciation'
import { PARTICLES, PHRASAL_PARTICLES } from './phrases'
import type { DictPron } from './types'

/**
 * The IPA of an English phrase built from its words' own: Wiktionary transcribes 4,367 of its
 * 131,202 phrases and 505 of its 12,834 idioms, and a learner saving "on the spot" got none.
 * Each word takes the transcription its own page shows (`pickAccentRows`), in the same accent,
 * so a phrase never mixes a UK word with a US one. Stress follows the dictionaries' phrase
 * entries: content words keep theirs, function words lose it, an article or a non-final
 * function word takes its weak form, and a phrasal verb stresses its particle (/ˌɡɪv ˈʌp/).
 */

export type PhraseAccent = 'uk' | 'us'
export type PhraseIpa = Record<PhraseAccent, string | null>

/** Weak and strong forms, UK then US, written the way the dictionary's English rows write
 *  them. The source rows of these words mix phonetic, dialect and historical forms (on has
 *  /ɔn/ beside /ɒn/ under UK), so none of them comes from it. */
const FORMS: Record<string, { weak: [string, string]; strong: [string, string] }> = {
  a: { weak: ['ə', 'ə'], strong: ['eɪ', 'eɪ'] },
  an: { weak: ['ən', 'ən'], strong: ['æn', 'æn'] },
  the: { weak: ['ðə', 'ðə'], strong: ['ðiː', 'ði'] },
  of: { weak: ['əv', 'əv'], strong: ['ɒv', 'ʌv'] },
  to: { weak: ['tə', 'tə'], strong: ['tuː', 'tu'] },
  for: { weak: ['fə', 'fɚ'], strong: ['fɔː', 'fɔɹ'] },
  at: { weak: ['ət', 'ət'], strong: ['æt', 'æt'] },
  from: { weak: ['fɹəm', 'fɹəm'], strong: ['fɹɒm', 'fɹʌm'] },
  and: { weak: ['ənd', 'ənd'], strong: ['ænd', 'ænd'] },
  as: { weak: ['əz', 'əz'], strong: ['æz', 'æz'] },
  than: { weak: ['ðən', 'ðən'], strong: ['ðæn', 'ðæn'] },
  can: { weak: ['kən', 'kən'], strong: ['kæn', 'kæn'] },
  some: { weak: ['səm', 'səm'], strong: ['sʌm', 'sʌm'] },
  her: { weak: ['hə', 'hɚ'], strong: ['hɜː', 'hɝ'] },
  your: { weak: ['jə', 'jɚ'], strong: ['jɔː', 'jɔɹ'] },
  our: { weak: ['aʊə', 'aʊɚ'], strong: ['aʊə', 'aʊɚ'] },
  their: { weak: ['ðə', 'ðɚ'], strong: ['ðeə', 'ðɛɹ'] },
  on: { weak: ['ɒn', 'ɑn'], strong: ['ɒn', 'ɑn'] },
  in: { weak: ['ɪn', 'ɪn'], strong: ['ɪn', 'ɪn'] },
  into: { weak: ['ɪntə', 'ɪntə'], strong: ['ɪntuː', 'ɪntu'] },
  by: { weak: ['baɪ', 'baɪ'], strong: ['baɪ', 'baɪ'] },
  with: { weak: ['wɪð', 'wɪθ'], strong: ['wɪð', 'wɪθ'] },
  it: { weak: ['ɪt', 'ɪt'], strong: ['ɪt', 'ɪt'] },
  its: { weak: ['ɪts', 'ɪts'], strong: ['ɪts', 'ɪts'] },
  his: { weak: ['ɪz', 'ɪz'], strong: ['hɪz', 'hɪz'] },
  my: { weak: ['maɪ', 'maɪ'], strong: ['maɪ', 'maɪ'] },
  "one's": { weak: ['wʌnz', 'wʌnz'], strong: ['wʌnz', 'wʌnz'] },
  me: { weak: ['mi', 'mi'], strong: ['miː', 'mi'] },
  him: { weak: ['ɪm', 'ɪm'], strong: ['hɪm', 'hɪm'] },
  us: { weak: ['əs', 'əs'], strong: ['ʌs', 'ʌs'] },
  them: { weak: ['ðəm', 'ðəm'], strong: ['ðɛm', 'ðɛm'] },
  you: { weak: ['jə', 'jə'], strong: ['juː', 'ju'] },
  is: { weak: ['ɪz', 'ɪz'], strong: ['ɪz', 'ɪz'] },
  are: { weak: ['ə', 'ɚ'], strong: ['ɑː', 'ɑɹ'] },
  was: { weak: ['wəz', 'wəz'], strong: ['wɒz', 'wʌz'] },
  be: { weak: ['bi', 'bi'], strong: ['biː', 'bi'] },
  have: { weak: ['həv', 'həv'], strong: ['hæv', 'hæv'] },
  has: { weak: ['həz', 'həz'], strong: ['hæz', 'hæz'] },
  had: { weak: ['həd', 'həd'], strong: ['hæd', 'hæd'] },
  do: { weak: ['də', 'də'], strong: ['duː', 'du'] },
  or: { weak: ['ə', 'ɚ'], strong: ['ɔː', 'ɔɹ'] },
  but: { weak: ['bət', 'bət'], strong: ['bʌt', 'bʌt'] },
  if: { weak: ['ɪf', 'ɪf'], strong: ['ɪf', 'ɪf'] },
  that: { weak: ['ðət', 'ðət'], strong: ['ðæt', 'ðæt'] },
}

/** Function words without a fixed form above: their own transcription, unstressed. */
const UNSTRESSED = new Set([
  'onto', 'upon', 'were', 'been', 'am', 'does', 'did', 'will', 'would', 'shall', 'should', 'could', 'must',
  'may', 'might',
])

const PHRASAL = new Set(PHRASAL_PARTICLES)

/** A word the phrase may hold: letters with an inner apostrophe or hyphen ("one's", "well-off"). */
const WORD = /^[a-z]+(?:['-][a-z]+)*$/

const VOWEL_START = /^[ˈˌ]?[aeiouæɑɒɔəɛɜɪʊʌɐɚ]/

const bare = (ipa: string) => ipa.trim().replace(/^\/|\/$/g, '')

/** A phonemic transcription of one word with no variants: no brackets, slashes inside,
 *  alternatives or optional sounds. */
function usable(ipa: string | null): ipa is string {
  if (!ipa) return false
  const t = ipa.trim()
  return t.startsWith('/') && t.endsWith('/') && !/[[\](),~/]/.test(t.slice(1, -1)) && !/\s/.test(t.slice(1, -1))
}

/** No diacritic but the syllabic mark, and none of the vowels that only regional rows use:
 *  out's UK rows include /ˈäʊ̯t/ and /ˈawt/, take's /ˈteːk/, bright's US /ˈbɹaːt/. */
const standard = (ipa: string) => !/[̀-̨̪-ͯ]|[ɵʉʔɐ]|ɑɪ|æɔ|aː|eː|oː/.test(ipa.normalize('NFD'))

/** The non-syllabic mark only says the vowel is the second half of a diphthong, which the
 *  standard notation leaves implied: /ˈteɪ̯k/ is /ˈteɪk/. */
const plain = (p: DictPron): DictPron => (p.ipa ? { ...p, ipa: p.ipa.normalize('NFD').replace(/̯/g, '').normalize('NFC') } : p)

const stressFirst = (s: string) => (/[ˈˌ]/.test(s) ? s : `ˈ${s}`)
const unstress = (s: string) => s.replace(/[ˈˌ]/g, '')
/** A phrasal verb's verb keeps a secondary stress: give up is /ˌɡɪv ˈʌp/. */
const secondary = (s: string) => (/ˈ/.test(s) ? s.replace('ˈ', 'ˌ') : /ˌ/.test(s) ? s : `ˌ${s}`)

/** A verb and one or two particles: give up, look forward to, put up with. */
export function isPhrasalVerb(words: readonly string[], isVerb: boolean): boolean {
  return isVerb && words.length >= 2 && words.length <= 3 && words.slice(1).every((w) => PHRASAL.has(w))
}

/** One word's transcription in `accent`: the row its own page shows, preferring rows in the
 *  standard accents. */
function wordIpa(word: string, source: readonly DictPron[], accent: PhraseAccent): string | null {
  const rows = source.map(plain)
  const clean = rows.filter((p) => !p.ipa || standard(p.ipa))
  for (const set of [clean, rows]) {
    const ipa = pickAccentRows([...set], 'en', word).find((r) => r.label.toLowerCase() === accent)?.ipa ?? null
    if (usable(ipa) && standard(ipa)) return bare(ipa)
  }
  return null
}

/** The transcription of `headword` in each accent, or null for an accent where some word has
 *  none. `prons` holds each word's pronunciation rows, keyed by the lower-cased word. */
export function composePhraseIpa(
  headword: string,
  prons: ReadonlyMap<string, readonly DictPron[]>,
  isVerb: boolean,
): PhraseIpa {
  const out: PhraseIpa = { uk: null, us: null }
  const words = headword.toLowerCase().trim().split(/\s+/)
  if (words.length < 2 || !words.every((w) => WORD.test(w))) return out
  const phrasal = isPhrasalVerb(words, isVerb)
  for (const [ai, accent] of (['uk', 'us'] as const).entries()) {
    const own = words.map((w) => (Object.hasOwn(FORMS, w) ? '' : wordIpa(w, prons.get(w) ?? [], accent)))
    if (own.some((x) => x === null)) continue
    const parts: string[] = []
    for (let i = words.length - 1; i >= 0; i -= 1) {
      const w = words[i]
      const particle = phrasal && i > 0 && PARTICLES.has(w)
      let s: string
      if (Object.hasOwn(FORMS, w)) {
        const f = FORMS[w]
        if (particle) s = `ˈ${f.strong[ai]}`
        else if (i === words.length - 1) s = f.strong[ai]
        else if (w === 'the' && VOWEL_START.test(parts[0])) s = 'ði'
        else if (w === 'to' && VOWEL_START.test(parts[0])) s = 'tu'
        else s = f.weak[ai]
      } else {
        const x = own[i]!
        if (phrasal && i === 0) s = secondary(x)
        else if (particle) s = stressFirst(x)
        else if (UNSTRESSED.has(w) || (phrasal && i > 0)) s = unstress(x)
        else s = stressFirst(x)
      }
      parts.unshift(s)
    }
    out[accent] = `/${parts.join(' ')}/`
  }
  return out
}
