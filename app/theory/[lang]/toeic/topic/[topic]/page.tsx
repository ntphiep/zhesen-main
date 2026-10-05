import { notFound } from 'next/navigation'
import { getLanguage, isLangCode } from '@/lib/languages'
import { findToeicTopic, toeicGuide } from '@/lib/theory/content'
import { toeicTopicPath } from '@/lib/theory/path'
import { loadToeicTopic } from '@/lib/theory/toeicStudy'
import { ToeicTopicView } from '@/components/theory/ToeicTopicView'

import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/site'
import { TheoryBreadcrumb } from '@/components/seo/BreadcrumbJsonLd'

/** Empty on purpose: a topic reads a dozen entries, and building every topic at once is
 *  the shape of read that timed out the build in #28. Each topic renders on its first visit
 *  and is served from the route cache afterwards. */
export function generateStaticParams(): { lang: string; topic: string }[] {
  return []
}

// One week, the literal value of `LEX_REVALIDATE` in `lib/dictionary/cached.ts`, which the
// entry reads under this page use. Written out because a segment config must be statically
// analysable.
export const revalidate = 604800

type Params = Promise<{ lang: string; topic: string }>

const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1)

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { lang, topic } = await params
  const language = isLangCode(lang) ? getLanguage(lang) : undefined
  const t = language && findToeicTopic(language.code, topic)
  if (!language || !t) return {}
  return pageMetadata({
    title: `Từ vựng TOEIC: ${t.titleVi}`,
    description: `Học ${t.words.length} từ TOEIC về ${lowerFirst(t.titleVi)} với nghĩa trong đề và phát âm.`,
    canonical: toeicTopicPath(language.code, t.id),
  })
}

export default async function ToeicTopicPage({ params }: { params: Params }) {
  const { lang, topic } = await params
  const language = isLangCode(lang) ? getLanguage(lang) : undefined
  const guide = language && toeicGuide(language.code)
  const t = language && findToeicTopic(language.code, topic)
  // Decided from written content before any read, so a cached 404 can never be wrong.
  if (!language || !guide || !t) notFound()
  const words = await loadToeicTopic(language.code, t)
  return (
    <>
      <TheoryBreadcrumb language={language} block="toeic" leaf={t.titleVi} />
      <ToeicTopicView language={language} guide={guide} topic={t} words={words} />
    </>
  )
}
