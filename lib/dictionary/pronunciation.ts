import type { LangCode } from '@/lib/content/types'
import type { DictPron } from './types'

export interface AccentRow {
  /** 'UK' | 'US' for English; '' for a single unlabeled row (es/zh). */
  label: string
  ipa: string | null
  audioUrl: string | null
  /** BCP47 tag for the TTS fallback voice (e.g. 'en-GB' for the UK row). */
  ttsLang: string
}

const TTS_LANG: Record<LangCode, string> = { en: 'en-US', es: 'es-ES', zh: 'zh-CN' }
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
  const audioMatch = candidates.find((p) => audioAccent(p.audioUrl) === accent)
  const ipa =
    audioMatch?.ipa && scoreIpa(audioMatch.ipa, headword) >= 0 ? audioMatch.ipa : bestIpa(candidates, headword)
  return { label, ipa, audioUrl: audioMatch?.audioUrl ?? null, ttsLang }
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
    return [{ label: '', ipa: bestIpa(prons, headword), audioUrl: prons.find((p) => p.audioUrl)?.audioUrl ?? null, ttsLang: 'en-US' }]
  }
  return [{
    label: '',
    ipa: bestIpa(prons, headword),
    audioUrl: prons.find((p) => p.audioUrl)?.audioUrl ?? null,
    ttsLang: TTS_LANG[lang],
  }]
}
