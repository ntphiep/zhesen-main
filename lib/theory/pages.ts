import type { GrammarPoint } from '@/lib/grammar/types'
import { grammarPointPath } from '@/lib/grammar/path'
import type { LangCode } from '@/lib/languages'
import { BLOCKS_BY_LANG, type TheoryBlockKey } from './blocks'
import { theoryContent } from './content'
import { theoryBlockPath, toeicPartPath, toeicTopicPath, vocabularyLevelPath, wordClassPath } from './path'

/** One page of a language's theory, in the order a learner meets it. */
export interface TheoryPage {
  block: TheoryBlockKey
  path: string
  title: string
}

/** Every page of a language's theory: each block's own page, then its pages in the order the
 *  block lists them. The TOEIC word list is left out: its pages are a frequency list read in
 *  any order, not a path. */
export function theoryPages(lang: LangCode, points: readonly GrammarPoint[], levels: readonly string[]): TheoryPage[] {
  const content = theoryContent(lang)
  return BLOCKS_BY_LANG[lang].flatMap((b): TheoryPage[] => {
    const own = { block: b.key, path: theoryBlockPath(lang, b.key), title: b.titleVi }
    const page = (path: string, title: string): TheoryPage => ({ block: b.key, path, title })
    switch (b.key) {
      case 'grammar': return [own, ...points.map((x) => page(grammarPointPath(x.id), x.titleVi))]
      case 'vocabulary': return [own, ...levels.map((l) => page(vocabularyLevelPath(lang, l), `Từ vựng ${l}`))]
      case 'word-class': return [own, ...(content?.wordClasses ?? []).map((c) => page(wordClassPath(lang, c.key), c.titleVi))]
      case 'toeic': return [
        own,
        ...(content?.toeic.parts ?? []).map((x) => page(toeicPartPath(lang, x.number), `Part ${x.number}: ${x.titleVi}`)),
        ...(content?.toeic.wordTopics ?? []).map((x) => page(toeicTopicPath(lang, x.id), x.titleVi)),
      ]
      default: return [own]
    }
  })
}
