import type { LangCode } from '@/lib/languages'
import type { ClozeGap } from './cloze'

/** One typed-answer question, in any of the typing modes. */
export interface TypingPrompt {
  /** The saved word's id, so an answer can be recorded against its schedule. */
  id: string
  headword: string
  meaningVi: string | null
  ipa: string | null
  audioUrl: string | null
  lang: LangCode
  /** Other spellings that count: pinyin and the traditional form for Chinese. */
  accepted?: string[]
  /** What counts as right when it is not the headword: "gave up" in a sentence, "went". */
  answer?: string
  /** cloze: the sentence around the gap. */
  gap?: ClozeGap
  /** forms: the form to type, "quá khứ đơn". */
  cue?: string
}

/** `accent`: right letters, missing or wrong accent (Spanish) or tone (pinyin). */
export type TypedResult = 'correct' | 'accent' | 'close' | 'wrong'

export interface TypedOptions {
  lang?: LangCode
  /** Other spellings that count as the word: pinyin and the traditional form for Chinese. */
  accepted?: string[]
  /** Accents never count against the answer, as for a speech transcript. */
  foldAccents?: boolean
}

const RANK: readonly TypedResult[] = ['correct', 'accent', 'close', 'wrong']

function squash(s: string): string {
  return s.normalize('NFC').replace(/[‘’]/g, "'").trim().toLowerCase().replace(/\s+/g, ' ')
}

function stripMarks(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC') // café -> cafe
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  let curr = new Array<number>(n + 1)
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[n]
}

const HAN = /\p{Script=Han}/u
const TONES: Record<string, string> = { a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', ü: 'ǖǘǚǜ' }

/** xue2 -> xué: the mark goes on a or e, on o in "ou", else on the last vowel. */
function markTone(syllable: string, tone: number): string {
  if (tone < 1 || tone > 4) return syllable
  const at = /[ae]/.test(syllable) ? syllable.search(/[ae]/)
    : syllable.includes('ou') ? syllable.indexOf('o')
      : Math.max(...[...'iouü'].map((v) => syllable.lastIndexOf(v)))
  if (at < 0) return syllable
  return syllable.slice(0, at) + TONES[syllable[at]][tone - 1] + syllable.slice(at + 1)
}

/** Toned pinyin with no spaces or apostrophes, numbered tones turned into marks. */
function pinyinKey(s: string): string {
  return squash(s).replace(/u:|v/g, 'ü')
    .replace(/([a-zü]+)([0-5])/g, (_, syl: string, t: string) => markTone(syl, Number(t)))
    .replace(/[\s'’\-·]/g, '')
}

function checkOne(input: string, expected: string, lang: LangCode | undefined, fold: boolean): TypedResult {
  if (lang === 'zh') {
    if (HAN.test(expected)) return input.replace(/\s/g, '') === expected.replace(/\s/g, '') ? 'correct' : 'wrong'
    const a = pinyinKey(input)
    const b = pinyinKey(expected)
    if (a === b) return 'correct'
    return stripMarks(a) === stripMarks(b) ? (fold ? 'correct' : 'accent') : 'wrong'
  }
  const a = squash(input)
  const b = squash(expected)
  const fa = stripMarks(a)
  const fb = stripMarks(b)
  if (fa === fb) return a === b || fold || lang !== 'es' ? 'correct' : 'accent'
  if (fb.length >= 4 && levenshtein(fa, fb) <= 1) return 'close'
  return 'wrong'
}

/**
 * Grade a typed answer against the expected word and any accepted spelling. Case- and
 * space-insensitive. Accents count only for Spanish, tones only for Chinese pinyin, and
 * a miss there is `accent`. A single-character typo on a word of 4+ letters counts as
 * "close" (shown as almost-right), shorter words must match exactly.
 */
export function checkTypedAnswer(input: string, expected: string, opts: TypedOptions = {}): TypedResult {
  const { lang, accepted = [], foldAccents = false } = opts
  if (!squash(input)) return 'wrong'
  const results = [expected, ...accepted].map((e) => checkOne(input, e, lang, foldAccents))
  return RANK.find((r) => results.includes(r)) ?? 'wrong'
}
