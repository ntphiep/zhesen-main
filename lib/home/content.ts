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

/** The verb the phrases section splits, its phrasal verbs, and for each the sense shown
 *  (`lex.senses.sense_order`) with the Chinese and Spanish entry for that sense, picked by
 *  hand: a reverse lookup of the Vietnamese answered 竟然 (an adverb) for turn out, and the
 *  ranked first sense of turn up is "tìm ra", which 出现 does not translate. The Vietnamese
 *  and the headwords are read from the dictionary (lib/home/landing.ts); an id it no longer
 *  holds drops that cell, and a sense it no longer holds falls back to `leadSense`. */
export const PHRASE_VERB = 'en:turn'
export const PHRASES: { id: string; sense: number; zh: string; es: string }[] = [
  { id: 'en:turn on', sense: 2, zh: 'zh:打开', es: 'es:encender' },
  { id: 'en:turn off', sense: 2, zh: 'zh:关', es: 'es:apagar' },
  { id: 'en:turn up', sense: 1, zh: 'zh:出现', es: 'es:aparecer' },
  { id: 'en:turn down', sense: 1, zh: 'zh:拒绝', es: 'es:rechazar' },
  { id: 'en:turn out', sense: 1, zh: 'zh:原来', es: 'es:resultar' },
  { id: 'en:turn into', sense: 1, zh: 'zh:变成', es: 'es:convertirse' },
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
