import { notFound } from 'next/navigation'
import { LANG_CODES, getLanguage, isLangCode } from '@/lib/languages'
import { findToeicPart, toeicGuide } from '@/lib/theory/content'
import { toeicPartPath } from '@/lib/theory/path'
import { ToeicPartView } from '@/components/theory/ToeicPartView'

import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/site'
import { TheoryBreadcrumb } from '@/components/seo/BreadcrumbJsonLd'

/** Written content, so every part is built once and nothing else is reachable. */
export function generateStaticParams(): { lang: string; part: string }[] {
  return LANG_CODES.flatMap((lang) =>
    (toeicGuide(lang)?.parts ?? []).map((p) => ({ lang, part: String(p.number) })),
  )
}

export const dynamicParams = false

type Params = Promise<{ lang: string; part: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { lang, part } = await params
  const language = isLangCode(lang) ? getLanguage(lang) : undefined
  const p = language && findToeicPart(language.code, part)
  const guide = language && toeicGuide(language.code)
  if (!language || !p || !guide) return {}
  const practice = p.extras.includes('practice') ? ` rồi luyện ${guide.practice.length} câu` : ''
  return pageMetadata({
    title: `TOEIC Part ${p.number}: ${p.titleVi}`,
    description: `Nắm dạng câu, mẹo và bẫy của Part ${p.number} ${p.nameEn}${practice}.`,
    canonical: toeicPartPath(language.code, p.number),
  })
}

export default async function ToeicPartPage({ params }: { params: Params }) {
  const { lang, part } = await params
  const language = isLangCode(lang) ? getLanguage(lang) : undefined
  const guide = language && toeicGuide(language.code)
  const p = language && findToeicPart(language.code, part)
  if (!language || !guide || !p) notFound()
  return (
    <>
      <TheoryBreadcrumb language={language} block="toeic" leaf={`Part ${p.number}`} />
      <ToeicPartView language={language} guide={guide} part={p} />
    </>
  )
}
