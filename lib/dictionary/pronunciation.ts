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

/** Tags around the word that do not change what is said, stripped in this order: a speaker
 *  or accent prefix (`En-au_ck1_crush`, `En_us_food`), a take number (`quatrefoil2`,
 *  `seine-2`, `a-(1)`; not `a1`, a code), parts of speech (`capitate_(verb)`,
 *  `upset-verb-adj`), a stress, accent or variant note (`your_unstressed`, `hashish_(alt)`,
 *  `what_(flapped)`, `fart-uk`, an untagged `walloon_us`), and a pronunciation suffix.
 *  Sense and etymology notes (`lead-metal`, `mow_(etymology_3)`) are kept: they can name
 *  another word. */
const FILE_TAGS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^en[-_](au|ca|gb|nyc|nz|uk|us)_(?:ck\d_)?/, 'en-$1-'],
  [/(?:(?<=[a-z']{2})\d|[-_]0?\d|_?\(\d\))$/, ''],
  [/(?:(?:-(?:noun|verb|adj|adjective|adv|adverb|n|v))+|_\((?:noun|verb|adj|adjective|adv|adverb)\))$/, ''],
  [/(?:[-_]\(?(?:un)?stressed\)?|_\((?:alt|alternate_pronunciation|au|uk|us|en-uk|nz_english|new_zealand_english|\d_syll|flapped)\)|-(?:us|uk)(?:-pron)?)$/, ''],
  [/^(?!en[-_]|ll-)(.+?)(?:_en)?_us$/, '$1'],
  [/[-_]+pronunciation$/, ''],
]

/** What is said: underscores are spaces, commas, `?` and `!` are silent, and an apostrophe
 *  may be written as an underscore (`en-au_ck1_nun_s`). A period is kept: `imp.` is not `imp`. */
function spoken(s: string): string {
  return s.replace(/[,!?]/g, '').replace(/’/g, "'").replace(/['_]/g, ' ')
}

function endsWithWord(base: string, want: string): boolean {
  const segments = base.split('-')
  for (let k = 1; k <= segments.length; k += 1) {
    if (spoken(segments.slice(-k).join('-')) === want) return true
  }
  return false
}

/** Whether a recording is of the headword itself. A Wikimedia filename is dash-separated
 *  tags then the word, spaces written as underscores, so the word must be a suffix of the
 *  segments, as named or with FILE_TAGS removed: `En-uk-a_cat.ogg` says "a cat". Over the
 *  96,765 English recordings of the full import, 91,015 matched before FILE_TAGS and
 *  94,129 match with them. */
export function audioMatchesHeadword(url: string | null, headword: string): boolean {
  if (!url) return false
  // Guarded: a stray `%` makes decodeURIComponent throw, and the throw escapes through
  // toPreview and loses the whole result list, not one row.
  const file = percentDecode(url.split('?')[0]).split('/').pop() ?? ''
  // Commons serves a transcode under the original name plus its own extension:
  // `LL-Q1860 (eng)-Speaker-cat.wav.ogg`.
  const base = file.replace(/(\.(?:wav|flac|ogg|oga|opus|mp3|webm))+$/i, '').toLowerCase()
  const want = spoken(headword.trim().toLowerCase())
  if (!want) return false
  const bare = FILE_TAGS.reduce((b, [tag, to]) => b.replace(tag, to), base)
  return endsWithWord(base, want) || endsWithWord(bare, want)
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

/** The accent a recording is of: its filename when that names one, else its accent
 *  column. Lingua Libre files (`LL-Q1860 (eng)-Speaker-cat.wav.ogg`) name none. */
function recordingAccent(p: DictPron): string | null {
  const fromName = audioAccent(p.audioUrl)
  if (fromName) return fromName
  const tag = p.accent.toLowerCase().match(/^en-([a-z]{2})$/)?.[1]
  return tag === 'gb' ? 'uk' : tag ?? null
}

/** Pick the representative pronunciation for one English accent bucket. A row joins
 * the bucket by its accent column OR by an audio filename naming that accent. */
function pickBucket(prons: DictPron[], accent: Accent, label: string, headword: string, ttsLang: string): AccentRow | null {
  const candidates = prons.filter((p) => p.accent.toLowerCase().includes(accent) || audioAccent(p.audioUrl) === accent)
  if (candidates.length === 0) return null
  const audioMatch = candidates.find(
    (p) => recordingAccent(p) === accent && audioMatchesHeadword(p.audioUrl, headword),
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
    // No UK or US recording of the word: offer one of another or an unnamed accent,
    // labelled with that accent rather than passed off as UK or US.
    if (!rows.some((r) => r.audioUrl)) {
      const other = prons.find((p) => audioMatchesHeadword(p.audioUrl, headword))
      if (other) {
        const acc = recordingAccent(other)
        rows.push({
          label: acc ? acc.toUpperCase() : '',
          ipa: other.ipa && scoreIpa(other.ipa, headword) >= 0 ? other.ipa : null,
          audioUrl: other.audioUrl,
          ttsLang: 'en-US',
        })
      }
    }
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

/** The Wikimedia Commons page of a recording, which names its author and licence. */
export function commonsFilePage(url: string | null): string | null {
  const m = url?.match(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/(?:transcoded\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/?]+)/)
  return m ? `https://commons.wikimedia.org/wiki/File:${m[1]}` : null
}
