import { notFound } from 'next/navigation'
import { LANG_CODES, getLanguage, isLangCode } from '@/lib/languages'
import { hasBlock } from '@/lib/theory/blocks'
import { theoryContent } from '@/lib/theory/content'
import { SentenceView } from '@/components/theory/SentenceView'

import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/site'

/** Written content, not a query, so every page of this block is built once and nothing
 *  else is reachable. */
export function generateStaticParams(): { lang: string }[] {
  return LANG_CODES.filter((lang) => hasBlock(lang, 'sentence')).map((lang) => ({ lang }))
}

export const dynamicParams = false

export async function generateMetadata(
  { params }: { params: Promise<{ lang: string }> },
): Promise<Metadata> {
  const { lang } = await params
  const language = isLangCode(lang) ? getLanguage(lang) : undefined
  if (!language) return {}
  return pageMetadata({
    title: `Câu và cụm từ ${language.name}`,
    description: `Cụm từ, mệnh đề, các kiểu câu và trật tự từ trong ${language.name}.`,
    canonical: `/theory/${language.code}/sentence`,
  })
}

export default async function SentencePage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  const language = isLangCode(lang) ? getLanguage(lang) : undefined
  const content = language && theoryContent(language.code)
  if (!language || !content) notFound()
  return <SentenceView language={language} topics={content.sentenceTopics} />
}
