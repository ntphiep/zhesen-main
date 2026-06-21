import { describe, it, expect } from 'vitest'
import { audioAccent, pickAccentRows } from '@/lib/dictionary/pronunciation'
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
