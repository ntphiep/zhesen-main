import { describe, it, expect } from 'vitest'
import { pronunciationTips, stressedSyllables, syllabify } from '@/lib/dictionary/soundNotes'

describe('syllabify', () => {
  it('counts syllables and finds the stressed one', () => {
    expect(syllabify('/dɪˈskɹɛʃən/')).toEqual({ count: 3, stress: 1 })
    expect(syllabify('/ˈhæpinəs/')).toEqual({ count: 3, stress: 0 })
  })

  it('reads a diphthong as one syllable and a length mark as the end of one', () => {
    expect(syllabify('/əˈbaʊt/')).toEqual({ count: 2, stress: 1 })
    expect(syllabify('/ˈbiːɪŋ/')).toEqual({ count: 2, stress: 0 })
  })

  it('reads two vowels that form no diphthong as two syllables', () => {
    expect(syllabify('/ˈmiːdiə/')).toEqual({ count: 3, stress: 0 })
    expect(syllabify('/ˈɪndiə/').count).toBe(3)
    expect(syllabify('/ˈpɪəɹiəd/').count).toBe(3)
    expect(syllabify('/ˈɡəʊɪŋ/').count).toBe(2)
  })

  it('counts a syllabic consonant and skips a non-syllabic vowel', () => {
    expect(syllabify('/ˈbʌt.n̩/').count).toBe(2)
    expect(syllabify('[ˈlɪi̯p]').count).toBe(1)
  })
})

describe('stressedSyllables', () => {
  it('marks the stressed written syllable when the counts agree', () => {
    expect(stressedSyllables('/dɪˈskɹɛʃən/', ['dis', 'cre', 'tion'])).toEqual({ parts: ['dis', 'cre', 'tion'], stress: 1 })
  })

  it('gives nothing when the written syllables do not match the IPA', () => {
    expect(stressedSyllables('/əˈbæn.dən/', ['aban', 'don'])).toBeNull()
    expect(stressedSyllables(null, ['dis', 'cre', 'tion'])).toBeNull()
  })
})

describe('pronunciationTips', () => {
  it('covers the final sound, an onset cluster and -tion for discretion', () => {
    expect(pronunciationTips('/dɪˈskɹɛʃən/', 'discretion')).toEqual([
      'Cụm /skr/ đọc liền, không chen nguyên âm vào giữa.',
      'Đuôi -tion đọc là /ʃən/.',
    ])
  })

  it('asks for the whole final cluster and the sounds Vietnamese lacks', () => {
    expect(pronunciationTips('/θɪŋks/', 'thinks')).toEqual([
      'Đọc đủ cụm phụ âm cuối /ŋks/.',
      'Âm /θ/ đặt đầu lưỡi giữa hai hàm răng rồi thổi hơi ra, không đọc thành /t/ hay "th".',
    ])
    expect(pronunciationTips('/kæts/', 'cats')[0]).toBe('Đọc đủ cụm phụ âm cuối /ts/.')
  })

  it('names a silent letter', () => {
    expect(pronunciationTips('/naɪf/', 'knife')).toContain('Chữ k đầu từ không đọc.')
    expect(pronunciationTips('/ˈaʊə/', 'hour')).toContain('Chữ h đầu từ không đọc.')
    expect(pronunciationTips('/ˌeɪtʃˌaɪˈviː/', 'HIV')).not.toContain('Chữ h đầu từ không đọc.')
  })

  it('does not call a letter silent when some accents say it', () => {
    expect(pronunciationTips('/(h)ɪˈstɒɹɪk/', 'historic')).not.toContain('Chữ h đầu từ không đọc.')
    expect(pronunciationTips('/ˈ(h)juːmən/', 'human')).not.toContain('Chữ h đầu từ không đọc.')
  })

  it('keeps the -tion tip off a word ending in /tʃən/', () => {
    expect(pronunciationTips('/ˈkwɛstʃən/', 'question')).not.toContain('Đuôi -tion đọc là /ʃən/.')
    expect(pronunciationTips('/ˈkwɛstʃən/', 'question')).toContain('Âm /tʃ/ bật hơi mạnh hơn "ch" tiếng Việt.')
  })

  it('reads an optional vowel as said and an optional consonant as not', () => {
    expect(pronunciationTips('/ˈɡɑː.d(ə)n/', 'garden').some((t) => t.includes('/dn/'))).toBe(false)
    expect(pronunciationTips('/kɑɹd/', 'card')[0]).toBe('Đọc rõ âm cuối /d/.')
  })

  it('gives nothing for a phrase or an affix', () => {
    expect(pronunciationTips('/teɪk ɒf/', 'take off')).toEqual([])
    expect(pronunciationTips('/-nəs/', '-ness')).toEqual([])
  })
})
