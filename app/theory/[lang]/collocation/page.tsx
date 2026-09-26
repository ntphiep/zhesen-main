import { notFound } from 'next/navigation'
import { LANG_CODES, getLanguage, isLangCode } from '@/lib/languages'
import { hasBlock } from '@/lib/theory/blocks'
import { theoryContent } from '@/lib/theory/content'
import { CollocationView } from '@/components/theory/CollocationView'

import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/site'

/** Written content, not a query, so every page of this block is built once and nothing
 *  else is reachable. */
export function generateStaticParams(): { lang: string }[] {
  return LANG_CODES.filter((lang) => hasBlock(lang, 'collocation')).map((lang) => ({ lang }))
}

export const dynamicParams = false

export async function generateMetadata(
  { params }: { params: Promise<{ lang: string }> },
): Promise<Metadata> {
  const { lang } = await params
  const language = isLangCode(lang) ? getLanguage(lang) : undefined
  if (!language) return {}
  return pageMetadata({
    title: `Collocation ${language.name}`,
    description: `Học các từ hay đi với nhau trong ${language.name}, theo từng dạng kết hợp.`,
    canonical: `/theory/${language.code}/collocation`,
  })
}

export default async function CollocationPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  const language = isLangCode(lang) ? getLanguage(lang) : undefined
  const content = language && theoryContent(language.code)
  if (!language || !content) notFound()
  return (
    <CollocationView
      language={language}
      patterns={content.collocationPatterns}
      sets={content.collocationSets}
    />
  )
}
