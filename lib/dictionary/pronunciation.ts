import { speechLang, type LangCode } from '@/lib/languages'
import { percentDecode } from '@/lib/http/percentDecode'
import type { DictPron } from './types'

export interface AccentRow {
  /** 'UK' | 'US' for English; '' for a single unlabeled row (es/zh). */
  label: string
  ipa: string | null
  audioUrl: string | null
  /** BCP47 tag for the TTS fallback voice (e.g. 'en-GB' for the UK row). */
  ttsLang: string
}

type Accent = 'uk' | 'us' | 'au' | 'ca'

/**
 * The accent encoded in a Wikimedia pronunciation filename, e.g.
 * "En-uk-dog.ogg" -> 'uk'. The source data sometimes files a recording under the
 * wrong accent column, so we trust the filename to route audio to the correct row
 * (and to drop a clip whose filename contradicts the row it sits on).
 */
export function audioAccent(url: string | null): Accent | null {
  if (!url) return null
  const m = url.toLowerCase().match(/en-(uk|gb|us|au|ca)[-._]/)
  if (!m) return null
  return m[1] === 'gb' ? 'uk' : (m[1] as Accent)
}

/**
 * Whether a recording is of the headword itself.
 *
 * Wiktionary files some recordings under a phrase: "cat" carried
 * `En-uk-a_cat.ogg`, which says "a cat", and "and" carried
 * `En-us-ham-and-eggs.ogg`. The page played them as if they were the word.
 *
 * A Wikimedia pronunciation filename is dash-separated tags followed by the
 * word, with spaces written as underscores: `En-us-cat`, `En-us-inlandnorth-cat`,
 * `En-us-give_up`. So the word is a suffix of the dash-separated segments, and a
 * phrase recording fails that test because the extra word arrives inside the same
 * segment ("a_cat" reads as "a cat", not "cat"). Measured over the 699 recordings
 * in the data: 631 match their headword, 68 do not. The 68 include valid
 * recordings named after a speaker (`En-au_ck1_have`) as well as the wrong ones,
 * and dropping both is the right trade -- what replaces them is the speech
 * synthesiser saying the correct word, not silence.
 */
export function audioMatchesHeadword(url: string | null, headword: string): boolean {
  if (!url) return false
  // Guarded: a stray `%` in a stored URL made decodeURIComponent throw, and the
  // throw escaped through toPreview and lost the whole result list, not one row.
  const file = percentDecode(url.split('?')[0]).split('/').pop() ?? ''
  const base = file.replace(/\.[a-z0-9]+$/i, '').toLowerCase()
  const segments = base.split('-')
  const want = headword.trim().toLowerCase()
  for (let k = 1; k <= Math.min(4, segments.length); k += 1) {
    if (segments.slice(-k).join('-').replace(/_/g, ' ') === want) return true
  }
  return false
}

/**
 * A transcription as it should be displayed, with exactly one pair of delimiters.
 *
 * The sources disagree. Every Spanish row arrives already wrapped -- "/ˈola/",
 * or "[biˈβ̞iɾ]" where the source recorded a narrow phonetic transcription --
 * and every English row arrives bare, "hoʊld". The two places that render a
 * transcription each picked one of those conventions and were wrong about the
 * other language: the detail page added slashes and showed "//ˈola//", the
 * search list added none and showed "hoʊld".
 *
 * Slashes and brackets are not interchangeable: /…/ is phonemic, […] is
 * phonetic. Whichever the source chose is kept, because rewriting one as the
 * other asserts something the source did not. Only a bare value is wrapped, and
 * only in slashes.
 *
 * Chinese is the exception: that column carries pinyin, not a transcription, so
 * it is returned as it is. Pinyin between slashes would claim to be IPA.
 */
export function formatPronunciation(ipa: string | null, lang: LangCode): string | null {
  const t = ipa?.trim()
  if (!t) return null
  if (lang === 'zh') return t
  // Delimiters with nothing inside them, e.g. a row stored as "//".
  if (/^[/[\]\s]*$/.test(t)) return null
  if ((t.startsWith('/') && t.endsWith('/')) || (t.startsWith('[') && t.endsWith(']'))) return t
  return `/${t}/`
}

function deaccent(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}
function firstLetter(s: string): string {
  return deaccent(s.toLowerCase()).match(/[a-z]/)?.[0] ?? ''
}

/**
 * Higher score = more likely the canonical transcription of `headword`. Rewards a
 * stress mark (a full word, not a suffix) and a first phoneme matching the
 * spelling; this filters out mistagged inflection rows (e.g. "wəːs"/"worse" filed
 * under "bad"). Fragments beginning with a hyphen are rejected outright.
 */
function scoreIpa(ipa: string, headword: string): number {
  const t = ipa.trim()
  if (!t || t.startsWith('-')) return -1
  let s = 0
  if (/[ˈˌ]/.test(t)) s += 2
  if (firstLetter(t) && firstLetter(t) === firstLetter(headword)) s += 1
  return s
}

function bestIpa(prons: DictPron[], headword: string): string | null {
  const ranked = prons
    .filter((p): p is DictPron & { ipa: string } => Boolean(p.ipa) && scoreIpa(p.ipa!, headword) >= 0)
    .map((p, i) => ({ ipa: p.ipa, score: scoreIpa(p.ipa, headword), i }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
  return ranked[0]?.ipa ?? null
}

/** Pick the representative pronunciation for one English accent bucket. A row joins
 * the bucket by its accent column OR by an audio filename naming that accent. */
function pickBucket(prons: DictPron[], accent: Accent, label: string, headword: string, ttsLang: string): AccentRow | null {
  const candidates = prons.filter((p) => p.accent.toLowerCase().includes(accent) || audioAccent(p.audioUrl) === accent)
  if (candidates.length === 0) return null
  const audioMatch = candidates.find(
    (p) => audioAccent(p.audioUrl) === accent && audioMatchesHeadword(p.audioUrl, headword),
  )
  const ipa =
    audioMatch?.ipa && scoreIpa(audioMatch.ipa, headword) >= 0 ? audioMatch.ipa : bestIpa(candidates, headword)
  return { label, ipa, audioUrl: audioMatch?.audioUrl ?? null, ttsLang }
}

function firstMatchingAudio(prons: DictPron[], headword: string): string | null {
  return prons.find((p) => audioMatchesHeadword(p.audioUrl, headword))?.audioUrl ?? null
}

/**
 * Group an entry's pronunciations into the rows to render. English yields a UK
 * row and a US row (Cambridge-style), each with the IPA and recording for that
 * accent; other languages yield a single unlabeled row. Always returns at least
 * one row for non-English so the TTS button is shown.
 */
export function pickAccentRows(prons: DictPron[], lang: LangCode, headword: string): AccentRow[] {
  if (lang === 'en') {
    const rows = [
      pickBucket(prons, 'uk', 'UK', headword, 'en-GB'),
      pickBucket(prons, 'us', 'US', headword, 'en-US'),
    ].filter((r): r is AccentRow => r !== null)
    if (rows.length > 0) return rows
    return [{ label: '', ipa: bestIpa(prons, headword), audioUrl: firstMatchingAudio(prons, headword), ttsLang: 'en-US' }]
  }
  return [{
    label: '',
    ipa: bestIpa(prons, headword),
    audioUrl: firstMatchingAudio(prons, headword),
    ttsLang: speechLang(lang),
  }]
}
