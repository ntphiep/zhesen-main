import { notFound } from 'next/navigation'
import { LANG_CODES, getLanguage, isLangCode } from '@/lib/languages'
import { hasBlock } from '@/lib/theory/blocks'
import { theoryContent } from '@/lib/theory/content'
import { ToeicView } from '@/components/theory/ToeicView'

import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/site'

/** Written content, not a query, so every page of this block is built once and nothing
 *  else is reachable. */
export function generateStaticParams(): { lang: string }[] {
  return LANG_CODES.filter((lang) => hasBlock(lang, 'toeic')).map((lang) => ({ lang }))
}

export const dynamicParams = false

export async function generateMetadata(
  { params }: { params: Promise<{ lang: string }> },
): Promise<Metadata> {
  const { lang } = await params
  const language = isLangCode(lang) ? getLanguage(lang) : undefined
  if (!language) return {}
  return pageMetadata({
    title: 'Luyện thi TOEIC',
    description: 'Nắm cấu trúc đề TOEIC, mẹo từng part, từ vựng theo chủ đề và luyện 30 câu Part 5.',
    canonical: `/theory/${language.code}/toeic`,
  })
}

export default async function ToeicPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  const language = isLangCode(lang) ? getLanguage(lang) : undefined
  const content = language && theoryContent(language.code)
  if (!language || !content) notFound()
  return <ToeicView language={language} guide={content.toeic} />
}
