import { notFound } from 'next/navigation'
import { getLanguage, isLangCode, nameInSentence } from '@/lib/languages'
import { getCachedGrammarPointsByLang } from '@/lib/grammar/cached'
import { getCachedLevelsForLanguage } from '@/lib/dictionary/cached'
import { theoryContent } from '@/lib/theory/content'
import { BLOCKS_BY_LANG, type TheoryBlockKey } from '@/lib/theory/blocks'
import { theoryPages } from '@/lib/theory/pages'
import { TheoryHub } from '@/components/theory/TheoryHub'

import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/site'
import { TheoryBreadcrumb } from '@/components/seo/BreadcrumbJsonLd'

/** Empty, so the build never reads the level counts: prerendering them failed the build
 *  when the anon role's 3 s statement timeout fired (#28). Each language renders on its
 *  first request and stays in the route cache for `revalidate`. */
export function generateStaticParams(): { lang: string }[] {
  return []
}

// One week, the literal value of `LEX_REVALIDATE` in `lib/dictionary/cached.ts`, which
// the data caches under this page use. Written out because a segment config must be
// statically analysable: importing the constant fails the build with "Invalid segment
// configuration export detected".
export const revalidate = 604800

/** "a, b và c": Vietnamese puts no comma before "và". */
function listVi(items: string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} và ${items[items.length - 1]}`
}

export async function generateMetadata(
  { params }: { params: Promise<{ lang: string }> },
): Promise<Metadata> {
  const { lang } = await params
  const language = isLangCode(lang) ? getLanguage(lang) : undefined
  if (!language) return {}
  return pageMetadata({
    title: `Lý thuyết ${nameInSentence(language)}`,
    description: `Học ${listVi(BLOCKS_BY_LANG[language.code].map((b) => b.titleVi.toLowerCase()))} ${nameInSentence(language)}.`,
    canonical: `/theory/${language.code}`,
  })
}

export default async function TheoryLangPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  const language = isLangCode(lang) ? getLanguage(lang) : undefined
  if (!language) notFound()

  const [points, levels] = await Promise.all([
    getCachedGrammarPointsByLang(language.code),
    getCachedLevelsForLanguage(language.code),
  ])
  const content = theoryContent(language.code)

  const counts: Partial<Record<TheoryBlockKey, string>> = {
    grammar: `${points.length} điểm`,
    vocabulary: `${levels.length} trình độ`,
  }
  if (content) {
    counts.pronunciation = `${content.phonemes.length} âm`
    counts['word-class'] = `${content.wordClasses.length} loại`
    counts.sentence = `${content.sentenceTopics.length} chủ đề`
    counts.collocation = `${content.collocationPatterns.length} dạng kết hợp`
    counts.toeic = `${content.toeic.parts.length} Part, ${content.toeic.practice.length} câu luyện`
  }

  return (
    <>
      <TheoryBreadcrumb language={language} />
      <TheoryHub
        language={language}
        blocks={BLOCKS_BY_LANG[language.code]}
        counts={counts}
        pages={theoryPages(language.code, points, levels.map((l) => l.level))}
      />
    </>
  )
}
