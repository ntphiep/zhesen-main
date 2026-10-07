/**
 * What a Vietnamese learner needs to say an English word, read from its IPA and spelling:
 * how many syllables it has and which one carries the stress, and the sounds Vietnamese
 * lacks or drops. Deterministic, so every word with an IPA gets it.
 */

const VOWEL = /[iyɨʉɯuɪʏʊeøɘɵɤoəɛœɜɞʌɔæɐaɶɑɒɚɝ]/
/** The second half of a diphthong, with the vowels it closes: eɪ, aʊ, ɪə. After any other
 *  vowel it starts a syllable, so media /ˈmiːdiə/ has three. */
const GLIDES: Record<string, string> = { ɪ: 'eaɔoæɐʌɒ', ʊ: 'aoəɐæɛeʌɒ', ə: 'ɪʊeɛɔ', ɐ: 'ɪʊe', ʏ: 'œɵ', y: 'œø' }
const SYLLABIC = '̩'

export interface Syllabified {
  /** Syllable nuclei counted in the IPA. */
  count: number
  /** Index of the syllable after the primary stress mark; -1 when the IPA marks none. */
  stress: number
}

/** Counts the syllables of a transcription and finds the stressed one. Two vowels are one
 *  syllable when they form a diphthong, and a length mark ends a syllable, so being
 *  /ˈbiːɪŋ/ has two. Optional sounds in brackets count, as the written syllables do. */
export function syllabify(ipa: string): Syllabified {
  let count = 0
  let stress = -1
  let pending = false
  let prev = ''
  const open = (s: string) => {
    count += 1
    if (pending) { stress = count - 1; pending = false }
    prev = s
  }
  // A vowel marked non-syllabic (leap [ˈlɪi̯p]) belongs to the vowel before it.
  for (const c of ipa.normalize('NFD').replace(/[iyɨʉɯuɪʏʊeøɘɵɤoəɛœɜɞʌɔæɐaɶɑɒɚɝ]\u032F/g, '')) {
    if (c === 'ˈ') { pending = true; prev = ''; continue }
    if (c === 'ˌ' || c === '.' || c === 'ː' || c === 'ˑ' || c === ' ' || c === '‿') { prev = ''; continue }
    if (c === SYLLABIC) { open(''); prev = ''; continue }
    if (/\p{M}/u.test(c) || c === '(' || c === ')' || c === '/' || c === '[' || c === ']') continue
    if (VOWEL.test(c)) {
      if (prev && Object.hasOwn(GLIDES, c) && GLIDES[c].includes(prev)) prev = ''
      else open(c)
      continue
    }
    prev = ''
  }
  return { count, stress }
}

/** The written syllables with the stressed one marked, when the IPA agrees on how many
 *  there are; null otherwise or for a word of one syllable. */
export function stressedSyllables(ipa: string | null, syllables: string[] | null): { parts: string[]; stress: number } | null {
  if (!ipa || !syllables || syllables.length < 2) return null
  const { count, stress } = syllabify(ipa)
  return count === syllables.length && stress >= 0 ? { parts: syllables, stress } : null
}

const NON_VOWELS = '[^iyɨʉɯuɪʏʊeøɘɵɤoəɛœɜɞʌɔæɐaɶɑɒɚɝ]'
/** A sound in brackets is optional. An optional vowel stays, since garden /ˈɡɑː.d(ə)n/ is never
 *  said as a /dn/ cluster; an optional consonant or mark goes. */
const settled = (ipa: string) => ipa.normalize('NFD')
  .replace(/\(([^)]*)\)/g, (_, inner: string) => (VOWEL.test(inner) ? inner : ''))
/** The sounds a learner must say: a syllabic consonant (taken /ˈteɪ.kn̩/) read as the vowel it
 *  is, aspiration, tone and other modifiers removed. */
const bare = (ipa: string) => ipa
  .replace(/\S[\u0329\u030D]/g, 'ə')
  .replace(/[\p{M}ˈˌ.ːˑ/[\]()\s‿ʰʷʲˠˤˀ˭ʼ˥˦˧˨˩-]/gu, '')
  .replace(/[ɹɾʁ]/g, 'r').replace(/ɡ/g, 'g').replace(/ɫ/g, 'l')
/** Affricates are one sound; j and w glide into the vowel. */
const consonants = (run: string) => run.replace(/tʃ|dʒ/g, 'C').replace(/[jw]/g, '').length

/** Final sounds Vietnamese has no form of; its own final p, t, k, m, n and ng are kept. */
const FINALS: [RegExp, string][] = [
  [/tʃ$/, 'tʃ'], [/dʒ$/, 'dʒ'], [/ʃ$/, 'ʃ'], [/ʒ$/, 'ʒ'], [/θ$/, 'θ'], [/ð$/, 'ð'],
  [/s$/, 's'], [/z$/, 'z'], [/f$/, 'f'], [/v$/, 'v'], [/l$/, 'l'], [/d$/, 'd'], [/b$/, 'b'], [/g$/, 'g'],
]

/** One sound per tip, the hardest first. */
const SOUNDS: [RegExp, string][] = [
  [/θ/, 'Âm /θ/ đặt đầu lưỡi giữa hai hàm răng rồi thổi hơi ra, không đọc thành /t/ hay "th".'],
  [/ð/, 'Âm /ð/ đặt lưỡi như /θ/ nhưng rung dây thanh, không đọc thành /d/ hay /z/.'],
  [/(?<!d)ʒ/, 'Âm /ʒ/ đọc như /ʃ/ nhưng rung dây thanh.'],
  [/tʃ/, 'Âm /tʃ/ bật hơi mạnh hơn "ch" tiếng Việt.'],
  [/dʒ/, 'Âm /dʒ/ là /tʃ/ có rung dây thanh, không đọc thành "gi".'],
  [/(?<!t)ʃ/, 'Âm /ʃ/ tròn môi và đẩy hơi như khi suỵt.'],
  [/æ/, 'Âm /æ/ mở miệng rộng, nằm giữa "a" và "e".'],
]

/** Letters written but not said, checked against the IPA. */
const SILENT: [RegExp, RegExp, string][] = [
  [/^kn/i, /^n/, 'Chữ k đầu từ không đọc.'],
  [/^wr/i, /^r/, 'Chữ w đầu từ không đọc.'],
  [/^ps/i, /^s/, 'Chữ p đầu từ không đọc.'],
  [/^gn/i, /^n/, 'Chữ g đầu từ không đọc.'],
  [/^h[aeiou]/i, /^[^h]/, 'Chữ h đầu từ không đọc.'],
  [/mb$/i, /m$/, 'Chữ b cuối từ không đọc.'],
  [/mn$/i, /m$/, 'Chữ n cuối từ không đọc.'],
]

/** At most four tips for saying the word, from its IPA and spelling: the final sound, a
 *  consonant cluster that opens a syllable, letters not said, and the sounds Vietnamese lacks. */
export function pronunciationTips(ipa: string | null, headword: string): string[] {
  // A phrase is said word by word, and an affix never alone.
  if (!ipa || /\s|^-|-$/.test(headword.trim())) return []
  const said = settled(ipa)
  const sounds = bare(said)
  if (!sounds) return []
  const tips: string[] = []
  // A rhotic r before the final consonant colours the vowel: card /kɑɹd/ ends on /d/.
  const tail = (new RegExp(`${NON_VOWELS}+$`).exec(sounds)?.[0] ?? '').replace(/^r(?=.)/, '')
  if (consonants(tail) >= 2) tips.push(`Đọc đủ cụm phụ âm cuối /${tail}/.`)
  else {
    const final = FINALS.find(([re]) => re.test(tail))
    if (final) tips.push(`Đọc rõ âm cuối /${final[1]}/.`)
  }
  // A syllable starts the word or follows a stress or syllable mark: discretion /dɪˈskɹɛʃən/.
  const onset = said.split(/[ˈˌ.]/).map((seg) => new RegExp(`^${NON_VOWELS}+`).exec(bare(seg))?.[0] ?? '')
    .find((run) => consonants(run) >= 2)
  if (onset) tips.push(`Cụm /${onset}/ đọc liền, không chen nguyên âm vào giữa.`)
  // question /ˈkwɛstʃən/ ends in /tʃən/, not /ʃən/.
  const tion = /tion$/i.test(headword) && /(?<!t)ʃə?n$/.test(sounds)
  if (tion) tips.push('Đuôi -tion đọc là /ʃən/.')
  // An abbreviation or a name (HIV, Hmong) is spelled out or foreign; a letter is its name.
  const plain = headword.length >= 3 && headword === headword.toLowerCase()
  // A letter is silent only when no accent says it: historic /(h)ɪˈstɒɹɪk/ keeps its h.
  const full = bare(ipa.normalize('NFD').replace(/[()]/g, ''))
  const silent = plain ? SILENT.find(([spelled, saidAs]) => spelled.test(headword) && saidAs.test(sounds) && saidAs.test(full)) : undefined
  if (silent) tips.push(silent[2])
  for (const [re, tip] of SOUNDS) {
    if (re.test(sounds) && !(tion && tip.startsWith('Âm /ʃ/'))) tips.push(tip)
  }
  return tips.slice(0, 4)
}
