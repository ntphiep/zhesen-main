import { notFound } from 'next/navigation'
import { LANG_CODES, getLanguage, isLangCode } from '@/lib/languages'
import { buildGrammarPointId } from '@/lib/grammar/path'
import { getCachedGrammarPointsByLang } from '@/lib/grammar/cached'
import { findWordClass, theoryContent } from '@/lib/theory/content'
import { WordClassView } from '@/components/theory/WordClassView'

import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/site'

/** Both segments from here, which is the only place that can generate them
 *  (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-static-params.md). */
export function generateStaticParams(): { lang: string; key: string }[] {
  return LANG_CODES.flatMap((lang) =>
    (theoryContent(lang)?.wordClasses ?? []).map((c) => ({ lang, key: c.key })),
  )
}

export const dynamicParams = false

// One week, the literal value of `LEX_REVALIDATE` in `lib/dictionary/cached.ts`. The
// class itself is written here, but the grammar points it links to are read from the
// database. Written out because a segment config must be statically analysable.
export const revalidate = 604800

export async function generateMetadata(
  { params }: { params: Promise<{ lang: string; key: string }> },
): Promise<Metadata> {
  const { lang, key } = await params
  const language = isLangCode(lang) ? getLanguage(lang) : undefined
  const wordClass = language && findWordClass(language.code, key)
  if (!language || !wordClass) return {}
  return pageMetadata({
    title: `${wordClass.titleVi} trong ${language.name}`,
    description: wordClass.oneLineVi,
    canonical: `/theory/${language.code}/word-class/${wordClass.key}`,
  })
}

export default async function WordClassDetailPage(
  { params }: { params: Promise<{ lang: string; key: string }> },
) {
  const { lang, key } = await params
  const language = isLangCode(lang) ? getLanguage(lang) : undefined
  const wordClass = language && findWordClass(language.code, key)
  if (!language || !wordClass) notFound()

  const wanted = new Set(wordClass.grammarKeys.map((k) => buildGrammarPointId(language.code, k)))
  const points = wanted.size === 0
    ? []
    : (await getCachedGrammarPointsByLang(language.code)).filter((p) => wanted.has(p.id))

  return <WordClassView language={language} wordClass={wordClass} grammar={points} />
}
