import { describe, it, expect } from 'vitest'
import { audioAccent, audioMatchesHeadword, formatPronunciation, pickAccentRows } from '@/lib/dictionary/pronunciation'
import type { DictPron } from '@/lib/dictionary/types'

const p = (accent: string, ipa: string | null, audioUrl: string | null = null): DictPron => ({ accent, ipa, audioUrl })

describe('audioAccent', () => {
  it('reads the accent encoded in a Wikimedia filename', () => {
    expect(audioAccent('https://upload.wikimedia.org/.../En-uk-dog.ogg')).toBe('uk')
    expect(audioAccent('https://upload.wikimedia.org/.../En-us-develop.ogg')).toBe('us')
    expect(audioAccent('https://upload.wikimedia.org/.../En-us-ne-dog.ogg')).toBe('us')
    expect(audioAccent('https://upload.wikimedia.org/.../En-au-schedule.ogg')).toBe('au')
    expect(audioAccent('https://upload.wikimedia.org/.../En-gb-word.ogg')).toBe('uk')
  })
  it('returns null when no accent is encoded', () => {
    expect(audioAccent(null)).toBeNull()
    expect(audioAccent('https://example.com/some-clip.mp3')).toBeNull()
  })
})

describe('pickAccentRows (English)', () => {
  it('builds a UK row and a US row, each with its matching audio file', () => {
    const dog: DictPron[] = [
      p('en-CA', 'dɔ(ː)ɡ'),
      p('en-UK', 'doɡ'),
      p('en-UK', 'dɒɡ', 'https://upload.wikimedia.org/.../En-uk-dog.ogg'),
      p('en-US', 'dɑɡ', 'https://upload.wikimedia.org/.../En-us-dog.ogg'),
      p('en-US', 'dɔɡ', 'https://upload.wikimedia.org/.../En-us-ne-dog.ogg'),
    ]
    const rows = pickAccentRows(dog, 'en', 'dog')
    expect(rows.map((r) => r.label)).toEqual(['UK', 'US'])
    expect(rows[0]).toMatchObject({ label: 'UK', ipa: 'dɒɡ', ttsLang: 'en-GB' })
    expect(rows[0].audioUrl).toContain('En-uk-dog.ogg')
    expect(rows[1]).toMatchObject({ label: 'US', ipa: 'dɑɡ', ttsLang: 'en-US' })
    expect(rows[1].audioUrl).toContain('En-us-dog.ogg')
  })

  it('routes a mislabeled audio file to the accent its filename names, not its accent column', () => {
    // Source bug: a US recording is filed under an en-UK row. The UK row must NOT
    // play it (falls back to TTS), and the US row should pick it up.
    const develop: DictPron[] = [
      p('en', '-əp'),
      p('en-UK', 'dɪˈvɛl.əp', 'https://upload.wikimedia.org/.../En-us-develop.ogg'),
      p('en-UK', 'diˈveləp'),
      p('en-US', 'dɪvɛlʌp'),
    ]
    const rows = pickAccentRows(develop, 'en', 'develop')
    const uk = rows.find((r) => r.label === 'UK')!
    const us = rows.find((r) => r.label === 'US')!
    expect(uk.audioUrl).toBeNull() // mislabeled US file dropped from UK row
    expect(uk.ipa).toBe('dɪˈvɛl.əp') // stressed, real transcription wins
    expect(us.audioUrl).toContain('En-us-develop.ogg') // routed to US by filename
  })

  it('prefers the transcription that starts like the headword over a mistagged inflection', () => {
    // "bad" UK rows include comparative/superlative forms ("worse"/"worst") with no
    // audio; the representative IPA should be the one that starts with /b/.
    const bad: DictPron[] = [p('en-UK', 'wəːs'), p('en-UK', 'bæd'), p('en-UK', 'wəːst'), p('en-US', 'bæd')]
    const rows = pickAccentRows(bad, 'en', 'bad')
    expect(rows.find((r) => r.label === 'UK')!.ipa).toBe('bæd')
  })

  it('ignores fragment transcriptions that begin with a hyphen', () => {
    const rows = pickAccentRows([p('en-US', '-æd'), p('en-US', 'bæd')], 'en', 'bad')
    expect(rows.find((r) => r.label === 'US')!.ipa).toBe('bæd')
  })
})

describe('pickAccentRows (other languages)', () => {
  it('returns a single unlabeled row for Spanish', () => {
    const rows = pickAccentRows([p('es', 'ˈa.ɣwa')], 'es', 'agua')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ label: '', ipa: 'ˈa.ɣwa', ttsLang: 'es-ES' })
  })
  it('returns a single row for Chinese even with no IPA, for the TTS button', () => {
    const rows = pickAccentRows([], 'zh', '狗')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ label: '', ipa: null, ttsLang: 'zh-CN' })
  })
})

const COMMONS = 'https://upload.wikimedia.org/wikipedia/commons/1/1e/'

describe('audioMatchesHeadword', () => {
  it('accepts a recording named after the word', () => {
    expect(audioMatchesHeadword(`${COMMONS}En-us-cat.ogg`, 'cat')).toBe(true)
  })
  it('accepts one with an extra region tag in front', () => {
    expect(audioMatchesHeadword(`${COMMONS}En-us-inlandnorth-cat.ogg`, 'cat')).toBe(true)
  })
  it('accepts a multiword headword written with underscores', () => {
    expect(audioMatchesHeadword(`${COMMONS}En-us-give_up.ogg`, 'give up')).toBe(true)
  })
  it('accepts a hyphenated headword', () => {
    expect(audioMatchesHeadword(`${COMMONS}En-us-e-mail.ogg`, 'e-mail')).toBe(true)
  })
  it('rejects a recording of a phrase built around the word', () => {
    // The reported bug: the speaker button on "cat" played someone saying "a cat".
    expect(audioMatchesHeadword(`${COMMONS}En-uk-a_cat.ogg?utm_source=x`, 'cat')).toBe(false)
    expect(audioMatchesHeadword(`${COMMONS}En-uk-to_have.ogg`, 'have')).toBe(false)
    expect(audioMatchesHeadword(`${COMMONS}En-us-ham-and-eggs.ogg`, 'and')).toBe(false)
  })
  it('rejects nothing at all', () => {
    expect(audioMatchesHeadword(null, 'cat')).toBe(false)
  })
})

describe('pickAccentRows audio filtering', () => {
  it('leaves an accent row without audio rather than playing the wrong clip', () => {
    const rows = pickAccentRows(
      [p('en-UK', 'kat', `${COMMONS}En-uk-a_cat.ogg`), p('en-US', 'kæt', `${COMMONS}En-us-cat.ogg`)],
      'en', 'cat',
    )
    expect(rows.find((r) => r.label === 'UK')!.audioUrl).toBeNull()
    expect(rows.find((r) => r.label === 'US')!.audioUrl).toBe(`${COMMONS}En-us-cat.ogg`)
  })
})

describe('formatPronunciation', () => {
  // The sources disagree about delimiters: every Spanish transcription arrives
  // wrapped ("/ˈola/", and "[biˈβ̞iɾ]" for the phonetic ones), every English one
  // arrives bare ("hoʊld"). The detail page added its own slashes and the search
  // list added none, so Spanish rendered "//ˈola//" and English rendered "hoʊld".
  it('leaves a transcription that already carries its delimiters alone', () => {
    expect(formatPronunciation('/ˈola/', 'es')).toBe('/ˈola/')
    expect(formatPronunciation('[biˈβ̞iɾ]', 'es')).toBe('[biˈβ̞iɾ]')
  })

  it('wraps a bare transcription in the phonemic slashes', () => {
    expect(formatPronunciation('hoʊld', 'en')).toBe('/hoʊld/')
  })

  // Square brackets mean a narrow phonetic transcription and slashes mean a
  // phonemic one. Rewriting one as the other would assert something the source
  // did not, so the delimiter that is already there wins.
  it('never rewrites phonetic brackets into phonemic slashes', () => {
    expect(formatPronunciation('[biˈβ̞iɾ]', 'es')).not.toBe('/biˈβ̞iɾ/')
  })

  // Chinese entries carry pinyin in this column, not a transcription. Pinyin in
  // slashes claims to be IPA, which it is not.
  it('leaves Chinese pinyin unwrapped', () => {
    expect(formatPronunciation('yǒu méi yǒu', 'zh')).toBe('yǒu méi yǒu')
  })

  it('treats nothing, blank and empty delimiters as nothing to show', () => {
    expect(formatPronunciation(null, 'en')).toBeNull()
    expect(formatPronunciation('   ', 'en')).toBeNull()
    expect(formatPronunciation('//', 'es')).toBeNull()
  })

  it('trims incidental whitespace before deciding', () => {
    expect(formatPronunciation('  /ˈkasa/  ', 'es')).toBe('/ˈkasa/')
    expect(formatPronunciation('  keɪs  ', 'en')).toBe('/keɪs/')
  })
})
