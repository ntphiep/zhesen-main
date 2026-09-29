import type { LangCode } from '@/lib/languages'

/** Content of the landing page: words it looks up, example pairs and the Vietnamese
 *  sentences they come with. Content rather than interface copy, so outside the checked
 *  folders of test/copy-style.test.ts. */

/** The lookup the hero shows before the visitor types anything. */
export const EXAMPLE_QUERY = 'hoa'
export const HINT_WORDS = ['cảm ơn', 'cà phê', 'gia đình']
/** Offered when a language has no answer: words that answer in all three. */
export const TRY_WORDS = ['con mèo', 'trường học', 'âm nhạc', 'cảm ơn', 'cà phê', 'gia đình']

export const TAKE_ENTRY = 'en:take'

/** What a Vietnamese speaker says for a sound, keyed by the symbol in lib/theory/en/pronunciation.ts,
 *  whose trapVi explains it. */
export const SOUND_SLIPS = [
  { symbol: 'θ', said: 'tink', right: 'think', pron: '/θɪŋk/' },
  { symbol: 'ð', said: 'dis', right: 'this', pron: '/ðɪs/' },
  { symbol: 'ʃ', said: 'xi', right: 'she', pron: '/ʃiː/' },
  { symbol: 'n', said: 'sung', right: 'sun', pron: '/sʌn/' },
  { symbol: 'ʌ', said: 'bút', right: 'but', pron: '/bʌt/' },
  { symbol: 'æ', said: 'men', right: 'man', pron: '/mæn/' },
]

/** Mistakes from lib/theory/en/collocation.ts, by their wrong form, with the Vietnamese they translate. */
export const COLLOCATION_SLIPS = [
  { wrong: 'big rain', vi: 'mưa to' },
  { wrong: 'do a mistake', vi: 'mắc lỗi' },
  { wrong: 'make my homework', vi: 'làm bài tập' },
  { wrong: 'a fast shower', vi: 'tắm nhanh' },
]

export interface GrammarSlip {
  said: string
  right: string
  lang: LangCode
  vi: string
  why: string
  href: string
  linkText: string
}

/** Restated from /theory/zh/grammar/hsk1_tro-tu-nghi-van-ma, /theory/es/grammar/a1_gioi-tinh-danh-tu
 *  and the confusable block of /dictionary/zh/学习. */
export const GRAMMAR_SLIPS: GrammarSlip[] = [
  { said: '你是谁吗？', right: '你是谁？', lang: 'zh', vi: 'Bạn là ai?', why: 'Câu đã có đại từ nghi vấn như 什么 hay 谁 thì không thêm trợ từ 吗 ở cuối.', href: '/theory/zh/grammar/hsk1_tro-tu-nghi-van-ma', linkText: 'Trợ từ nghi vấn 吗' },
  { said: 'la libro', right: 'el libro', lang: 'es', vi: 'cuốn sách', why: 'Danh từ tiếng Tây Ban Nha nào cũng có giống. Người Việt hay quên vì đồ vật trong tiếng Việt không có giống, nên dùng sai mạo từ đi kèm.', href: '/theory/es/grammar/a1_gioi-tinh-danh-tu', linkText: 'Giống của danh từ' },
  { said: '努力学', right: '努力学习', lang: 'zh', vi: 'học chăm chỉ', why: '学 thường dùng trong khẩu ngữ và phải có tân ngữ (学英语), còn 学习 có thể đứng một mình.', href: `/dictionary/zh/${encodeURIComponent('学习')}`, linkText: 'Trang của 学习' },
]

/** Wrong answers for the multiple-choice mode, and pairs that fill the matching mode when
 *  fewer than four words have been looked up. */
export const QUIZ_DISTRACTORS = ['cửa sổ', 'con đường', 'buổi sáng', 'cái bàn']
export const MATCH_FILL: { headword: string; meaningVi: string; lang: LangCode }[] = [
  { headword: 'cat', meaningVi: 'con mèo', lang: 'en' },
  { headword: '学生', meaningVi: 'học sinh', lang: 'zh' },
  { headword: 'casa', meaningVi: 'nhà', lang: 'es' },
  { headword: 'coffee', meaningVi: 'cà phê', lang: 'en' },
]
