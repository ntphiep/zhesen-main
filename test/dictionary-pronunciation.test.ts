import { describe, it, expect } from 'vitest'
import { audioAccent, audioMatchesHeadword, commonsFilePage, formatPronunciation, pickAccentRows } from '@/lib/dictionary/pronunciation'
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

describe('audioMatchesHeadword with the tags Commons adds to a name', () => {
  it('accepts a numbered take of the word', () => {
    expect(audioMatchesHeadword(`${COMMONS}En-us-quatrefoil2.ogg`, 'quatrefoil')).toBe(true)
    expect(audioMatchesHeadword(`${COMMONS}En-us-seine-2.ogg`, 'Seine')).toBe(true)
    expect(audioMatchesHeadword(`${COMMONS}En-us-piquant_01.ogg`, 'piquant')).toBe(true)
    expect(audioMatchesHeadword(`${COMMONS}En-us-a-(1).ogg`, 'a-')).toBe(true)
  })
  it('keeps a number that belongs to the name', () => {
    expect(audioMatchesHeadword(`${COMMONS}En-us-catch-22.ogg`, 'catch')).toBe(false)
    expect(audioMatchesHeadword(`${COMMONS}En-us-catch-22.ogg`, 'catch-22')).toBe(true)
    expect(audioMatchesHeadword(`${COMMONS}En-uk-a1.ogg`, 'a')).toBe(false)
  })
  it('accepts a part-of-speech tag', () => {
    expect(audioMatchesHeadword(`${COMMONS}LL-Q1860 (eng)-X-capitate_(verb).wav.ogg`, 'capitate')).toBe(true)
    expect(audioMatchesHeadword(`${COMMONS}En-us-closer-noun.ogg`, 'closer')).toBe(true)
    expect(audioMatchesHeadword(`${COMMONS}En-us-impress-v.ogg`, 'impress')).toBe(true)
    expect(audioMatchesHeadword(`${COMMONS}En-us-profligate-verb2.ogg`, 'profligate')).toBe(true)
  })
  it('accepts a pronunciation suffix', () => {
    expect(audioMatchesHeadword(`${COMMONS}Colloquy_pronunciation.ogg`, 'colloquy')).toBe(true)
    expect(audioMatchesHeadword(`${COMMONS}En-burundi-pronunciation.ogg`, 'Burundi')).toBe(true)
  })
  it('accepts a speaker or accent prefix joined by an underscore', () => {
    expect(audioMatchesHeadword(`${COMMONS}En-au_ck1_crush.ogg`, 'crush')).toBe(true)
    expect(audioMatchesHeadword(`${COMMONS}En_us_food.ogg`, 'food')).toBe(true)
    expect(audioMatchesHeadword(`${COMMONS}En-nyc_brooklyn.ogg`, 'Brooklyn')).toBe(true)
  })
  it('accepts a stress, accent or alternative note', () => {
    expect(audioMatchesHeadword(`${COMMONS}En-us-your_unstressed.ogg`, 'your')).toBe(true)
    expect(audioMatchesHeadword(`${COMMONS}En-us_should_(stressed).ogg`, 'should')).toBe(true)
    expect(audioMatchesHeadword(`${COMMONS}LL-Q1860 (eng)-X-hashish_(alt).wav.ogg`, 'hashish')).toBe(true)
    expect(audioMatchesHeadword(`${COMMONS}Beefeater_(en-uk).ogg`, 'Beefeater')).toBe(true)
    expect(audioMatchesHeadword(`${COMMONS}Walloon_us.ogg`, 'Walloon')).toBe(true)
  })
  it('accepts several part-of-speech tags in a row', () => {
    expect(audioMatchesHeadword(`${COMMONS}En-us-upset-verb-adj.ogg`, 'upset')).toBe(true)
  })
  it('accepts an accent after a dash', () => {
    expect(audioMatchesHeadword(`${COMMONS}Fart-uk.ogg`, 'fart')).toBe(true)
    expect(audioMatchesHeadword(`${COMMONS}Hypocrite-us-pron.ogg`, 'hypocrite')).toBe(true)
    expect(audioMatchesHeadword(`${COMMONS}Greater-pronunciation-us.ogg`, 'greater')).toBe(true)
  })
  it('accepts a syllable, flapping or regional variant note', () => {
    expect(audioMatchesHeadword(`${COMMONS}En-us_what_(flapped).ogg`, 'what')).toBe(true)
    expect(audioMatchesHeadword(`${COMMONS}LL-Q1860 (eng)-X-colossians_(4_syll).wav.ogg`, 'Colossians')).toBe(true)
    expect(audioMatchesHeadword(`${COMMONS}En-us-yours_(alternate_pronunciation).ogg`, 'yours')).toBe(true)
    expect(audioMatchesHeadword(`${COMMONS}LL-Q1860 (eng)-X-mana_(nz_english).wav.ogg`, 'mana')).toBe(true)
  })
  it('ignores commas, question and exclamation marks, and how an apostrophe is written', () => {
    expect(audioMatchesHeadword(`${COMMONS}En-us-no_thanks.ogg`, 'no, thanks')).toBe(true)
    expect(audioMatchesHeadword(`${COMMONS}LL-Q1860 (eng)-X-am_i_under_arrest%3F.wav.ogg`, 'am I under arrest')).toBe(true)
    expect(audioMatchesHeadword(`${COMMONS}En-au_ck1_duck_s_guts.ogg`, "duck's guts")).toBe(true)
    expect(audioMatchesHeadword(`${COMMONS}LL-Q1860 (eng)-X-xi’an.wav.ogg`, "Xi'an")).toBe(true)
  })
  it('keeps a period and a leading apostrophe, which can make another word', () => {
    expect(audioMatchesHeadword(`${COMMONS}LL-Q1860 (eng)-X-imp.wav.ogg`, 'imp.')).toBe(false)
    expect(audioMatchesHeadword(`${COMMONS}En-us-kay.ogg`, "'kay")).toBe(false)
    expect(audioMatchesHeadword(`${COMMONS}En-us-!.ogg`, '!')).toBe(false)
  })
  it('accepts a headword of more than four hyphenated parts', () => {
    expect(audioMatchesHeadword(`${COMMONS}En-us-kiss-me-over-the-garden-gate.ogg`, 'kiss-me-over-the-garden-gate')).toBe(true)
  })
  it('still rejects a phrase, another word or a homophone', () => {
    expect(audioMatchesHeadword(`${COMMONS}En-uk-a_cat.ogg`, 'cat')).toBe(false)
    expect(audioMatchesHeadword(`${COMMONS}En-uk-to_drive.ogg`, 'drive')).toBe(false)
    expect(audioMatchesHeadword(`${COMMONS}En-au-zero_in_on.ogg`, 'zero in')).toBe(false)
    expect(audioMatchesHeadword(`${COMMONS}En-us-bale.ogg`, 'bael')).toBe(false)
    expect(audioMatchesHeadword(`${COMMONS}En-us-lead-metal.ogg`, 'lead')).toBe(false)
    expect(audioMatchesHeadword(`${COMMONS}En-uk-resound_(sound_again).ogg`, 'resound')).toBe(false)
    expect(audioMatchesHeadword(`${COMMONS}En-us-mow_(etymology_3).ogg`, 'mow')).toBe(false)
    expect(audioMatchesHeadword(`${COMMONS}En-us-plan-b.ogg`, 'plan')).toBe(false)
    expect(audioMatchesHeadword(`${COMMONS}En-uk-let_us.ogg`, 'let')).toBe(false)
    expect(audioMatchesHeadword(`${COMMONS}En_to_be.ogg`, 'be')).toBe(false)
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

const LL = 'https://upload.wikimedia.org/wikipedia/commons/transcoded/8/82/LL-Q1860_%28eng%29-Naomi_%28NaomiAmethyst%29-cat.wav/LL-Q1860_%28eng%29-Naomi_%28NaomiAmethyst%29-cat.wav.ogg'

describe('Lingua Libre and other-accent recordings', () => {
  it('matches a transcoded recording by the word before both extensions', () => {
    expect(audioMatchesHeadword(LL, 'cat')).toBe(true)
  })
  it('takes the accent from the accent column when the filename names none', () => {
    const rows = pickAccentRows([p('en-UK', 'kat'), p('en-US', 'kæt', LL)], 'en', 'cat')
    expect(rows.find((r) => r.label === 'US')!.audioUrl).toBe(LL)
    expect(rows.find((r) => r.label === 'UK')!.audioUrl).toBeNull()
  })
  it('offers an Australian recording under its own label when UK and US have none', () => {
    const au = `${COMMONS}En-au-cat.ogg`
    const rows = pickAccentRows([p('en-UK', 'kat'), p('en-US', 'kæt'), p('en-AU', 'kæt', au)], 'en', 'cat')
    expect(rows.map((r) => r.label)).toEqual(['UK', 'US', 'AU'])
    expect(rows[2].audioUrl).toBe(au)
  })
})

describe('commonsFilePage', () => {
  it('links an original and a transcoded file to the same file page', () => {
    expect(commonsFilePage(`${COMMONS}En-us-cat.ogg`)).toBe('https://commons.wikimedia.org/wiki/File:En-us-cat.ogg')
    expect(commonsFilePage(LL)).toBe('https://commons.wikimedia.org/wiki/File:LL-Q1860_%28eng%29-Naomi_%28NaomiAmethyst%29-cat.wav')
  })
  it('returns null for anything that is not a Commons upload', () => {
    expect(commonsFilePage(null)).toBeNull()
    expect(commonsFilePage('https://example.com/cat.ogg')).toBeNull()
  })
})

describe('pickAccentRows never leaves a pill without its IPA', () => {
  // take's UK row is only a recording of "to take"; its unlabeled rows carry dialect spellings.
  const take = [
    p('en-US', '/teɪk/'), p('en', '[ˈtʰeɪ̯k]'), p('en', '/ˈtæk/'), p('en', '/ˈtɛk/'),
    p('en-UK', null, `${COMMONS}En-uk-to_take.ogg`), p('en', '/ˈteɪ̯k/'),
  ]

  it('fills an accent with no IPA from the unlabeled rows, nearest the other accent', () => {
    expect(pickAccentRows(take, 'en', 'take').find((r) => r.label === 'UK')!.ipa).toBe('/ˈteɪ̯k/')
  })

  it('takes an unlabeled IPA when no accent has one', () => {
    const bumble = [p('en', '/ˈbʌmbəl/'), p('en-US', null, `${COMMONS}En-us-bumble.ogg`)]
    expect(pickAccentRows(bumble, 'en', 'bumble').find((r) => r.label === 'US')!.ipa).toBe('/ˈbʌmbəl/')
  })

  // light's US recording carries the phonetic [ɫɐɪt].
  it('prefers a phonemic transcription to a phonetic one', () => {
    const light = [
      p('en-US', '/laɪt/'), p('en-US', '[ɫɐɪt]', `${COMMONS}En-us-light.ogg`),
      p('en-UK', '[laɪt]', `${COMMONS}En-uk-light.ogg`), p('en', '/laɪt/'),
    ]
    const rows = pickAccentRows(light, 'en', 'light')
    expect(rows.find((r) => r.label === 'US')).toMatchObject({ ipa: '/laɪt/', audioUrl: `${COMMONS}En-us-light.ogg` })
    expect(rows.find((r) => r.label === 'UK')!.ipa).toBe('/laɪt/')
  })
})
