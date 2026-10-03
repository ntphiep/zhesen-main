import type { LangCode } from '@/lib/languages'
import type { TheoryBlockKey } from './blocks'

/** Every route under the theory section. `/grammar` and `/learn` were separate sections
 *  until they became two blocks of this one; `next.config.ts` redirects both. */
export const THEORY_PATH = '/theory'

export function theoryLangPath(lang: LangCode): string {
  return `${THEORY_PATH}/${lang}`
}

export function theoryBlockPath(lang: LangCode, block: TheoryBlockKey): string {
  return `${theoryLangPath(lang)}/${block}`
}

export function vocabularyLevelPath(lang: LangCode, level: string): string {
  return `${theoryBlockPath(lang, 'vocabulary')}/${encodeURIComponent(level)}`
}

/** One page of a level's word list. Page 1 is the level itself, so it has one URL. */
export function levelPageHref(lang: LangCode, level: string, page: number): string {
  const path = vocabularyLevelPath(lang, level)
  return page > 1 ? `${path}?page=${page}` : path
}

export function wordClassPath(lang: LangCode, key: string): string {
  return `${theoryBlockPath(lang, 'word-class')}/${encodeURIComponent(key)}`
}

/** One phoneme inside the single pronunciation page. A fragment rather than a route of
 *  its own: 44 sounds are one table the reader scans, and every link into it comes from
 *  a transcription that names the symbol. */
export function phonemePath(lang: LangCode, symbol: string): string {
  return `${theoryBlockPath(lang, 'pronunciation')}#${encodeURIComponent(symbol)}`
}
