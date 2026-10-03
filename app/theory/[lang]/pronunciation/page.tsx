import { notFound } from 'next/navigation'
import { LANG_CODES, getLanguage, isLangCode } from '@/lib/languages'
import { hasBlock } from '@/lib/theory/blocks'
import { theoryContent } from '@/lib/theory/content'
import { PronunciationView } from '@/components/theory/PronunciationView'

import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/site'
import { TheoryBreadcrumb } from '@/components/seo/BreadcrumbJsonLd'

/** Written content, not a query, so every page of this block is built once and nothing
 *  else is reachable. */
export function generateStaticParams(): { lang: string }[] {
  return LANG_CODES.filter((lang) => hasBlock(lang, 'pronunciation')).map((lang) => ({ lang }))
}

export const dynamicParams = false

export async function generateMetadata(
  { params }: { params: Promise<{ lang: string }> },
): Promise<Metadata> {
  const { lang } = await params
  const language = isLangCode(lang) ? getLanguage(lang) : undefined
  if (!language) return {}
  return pageMetadata({
    title: `Phát âm ${language.name}`,
    description: `Học bảng âm ${language.name} kèm ví dụ, cách viết và lỗi người Việt hay mắc.`,
    canonical: `/theory/${language.code}/pronunciation`,
  })
}

export default async function PronunciationPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  const language = isLangCode(lang) ? getLanguage(lang) : undefined
  const content = language && theoryContent(language.code)
  if (!language || !content) notFound()
  return (
    <>
      <TheoryBreadcrumb language={language} block="pronunciation" />
      <PronunciationView
        language={language}
        phonemes={content.phonemes}
        notes={content.pronunciationNotes}
      />
    </>
  )
}
