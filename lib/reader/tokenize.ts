import type { LangCode } from '@/lib/languages'

/** A piece of source text: a clickable `word`, or a non-word `gap` (spaces, punctuation). */
export interface Segment {
  text: string
  word: boolean
}

// A word is a run of letters, optionally joined internally by a single apostrophe
// or hyphen (don't, well-being). Unicode-aware so accented Spanish letters count.
const LATIN_WORD = /\p{L}+(?:['’\-]\p{L}+)*/gu
const HAN = /\p{Script=Han}/u

/** Tokenize whitespace-delimited scripts (en, es): split words from gaps, loss-lessly. */
export function tokenizeLatin(text: string): Segment[] {
  const segments: Segment[] = []
  let last = 0
  for (const m of text.matchAll(LATIN_WORD)) {
    const start = m.index
    if (start > last) segments.push({ text: text.slice(last, start), word: false })
    segments.push({ text: m[0], word: true })
    last = start + m[0].length
  }
  if (last < text.length) segments.push({ text: text.slice(last), word: false })
  return segments
}

/**
 * Tokenize Han text (zh): greedily match the longest dictionary headword at each
 * position; unmatched Han characters become single-character words; non-Han runs
 * are gaps. Loss-less (joining segment texts reproduces the input).
 */
export function tokenizeHan(text: string, headwords: string[]): Segment[] {
  const byLengthDesc = [...new Set(headwords)].sort((a, b) => [...b].length - [...a].length)
  const chars = [...text]
  const segments: Segment[] = []
  let gap = ''
  const flushGap = () => {
    if (gap) { segments.push({ text: gap, word: false }); gap = '' }
  }
  let i = 0
  while (i < chars.length) {
    if (!HAN.test(chars[i])) { gap += chars[i]; i += 1; continue }
    flushGap()
    const rest = chars.slice(i).join('')
    const match = byLengthDesc.find((hw) => hw.length > 0 && rest.startsWith(hw))
    if (match) {
      segments.push({ text: match, word: true })
      i += [...match].length
    } else {
      segments.push({ text: chars[i], word: true })
      i += 1
    }
  }
  flushGap()
  return segments
}

/** Dispatch by language: Han segmentation for zh, whitespace tokenization otherwise. */
export function tokenize(lang: LangCode, text: string, zhHeadwords: string[] = []): Segment[] {
  return lang === 'zh' ? tokenizeHan(text, zhHeadwords) : tokenizeLatin(text)
}
