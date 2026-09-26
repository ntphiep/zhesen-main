import { notFound } from 'next/navigation'
import { LANG_CODES, getLanguage, isLangCode } from '@/lib/languages'
import { hasBlock } from '@/lib/theory/blocks'
import { theoryContent } from '@/lib/theory/content'
import { WordClassList } from '@/components/theory/WordClassList'

import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/site'

/** Written content, not a query, so every page of this block is built once and nothing
 *  else is reachable. */
export function generateStaticParams(): { lang: string }[] {
  return LANG_CODES.filter((lang) => hasBlock(lang, 'word-class')).map((lang) => ({ lang }))
}

export const dynamicParams = false

export async function generateMetadata(
  { params }: { params: Promise<{ lang: string }> },
): Promise<Metadata> {
  const { lang } = await params
  const language = isLangCode(lang) ? getLanguage(lang) : undefined
  if (!language) return {}
  return pageMetadata({
    title: `Từ loại ${language.name}`,
    description: `Học các loại từ trong ${language.name}: vai trò trong câu, cách biến đổi và lỗi hay mắc.`,
    canonical: `/theory/${language.code}/word-class`,
  })
}

export default async function WordClassPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  const language = isLangCode(lang) ? getLanguage(lang) : undefined
  const content = language && theoryContent(language.code)
  if (!language || !content) notFound()
  return <WordClassList language={language} classes={content.wordClasses} />
}
