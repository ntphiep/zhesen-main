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

/** The accent tagged in a Wikimedia filename, e.g. "En-uk-dog.ogg" -> 'uk'. The source
 *  sometimes files a recording under the wrong accent column, so the filename wins. */
export function audioAccent(url: string | null): Accent | null {
  if (!url) return null
  const m = url.toLowerCase().match(/en-(uk|gb|us|au|ca)[-._]/)
  if (!m) return null
  return m[1] === 'gb' ? 'uk' : (m[1] as Accent)
}

/** Whether a recording is of the headword itself. A Wikimedia filename is dash-separated
 *  tags then the word, spaces written as underscores, so the word must be a suffix of the
 *  segments: `En-uk-a_cat.ogg` says "a cat". Measured over 699 recordings: 631 match, 68
 *  do not, and the 68 include speaker-named files (`En-au_ck1_have`) that are dropped too. */
export function audioMatchesHeadword(url: string | null, headword: string): boolean {
  if (!url) return false
  // Guarded: a stray `%` makes decodeURIComponent throw, and the throw escapes through
  // toPreview and loses the whole result list, not one row.
  const file = percentDecode(url.split('?')[0]).split('/').pop() ?? ''
  const base = file.replace(/\.[a-z0-9]+$/i, '').toLowerCase()
  const segments = base.split('-')
  const want = headword.trim().toLowerCase()
  for (let k = 1; k <= Math.min(4, segments.length); k += 1) {
    if (segments.slice(-k).join('-').replace(/_/g, ' ') === want) return true
  }
  return false
}

/** A transcription with exactly one pair of delimiters. Spanish rows arrive wrapped,
 *  English bare. Keep whichever delimiter the source chose -- /…/ is phonemic, […] is
 *  phonetic -- and wrap only a bare value. Chinese carries pinyin, returned untouched. */
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

/** Higher score = more likely the canonical transcription of `headword`. Rewards a stress
 *  mark and a first phoneme matching the spelling, which drops mistagged inflection rows
 *  ("wəːs"/"worse" filed under "bad"); a leading hyphen is rejected outright. */
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

/** Group pronunciations into the rows to render: English yields a UK and a US row, other
 *  languages one unlabeled row. Always at least one row, so the TTS button is shown. */
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
