import { notFound } from 'next/navigation'
import { LANG_CODES, getLanguage, isLangCode } from '@/lib/languages'
import { getCachedGrammarPointsByLang } from '@/lib/grammar/cached'
import { groupByLevelAndCategory } from '@/lib/grammar/group'
import { GrammarPointList } from '@/components/grammar/GrammarPointList'

import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/site'

/** The three languages are a fixed list, so their hubs are prerendered at build. */
export function generateStaticParams(): { lang: string }[] {
  return LANG_CODES.map((lang) => ({ lang }))
}


/**
 * Everything this page reads comes from `unstable_cache`, and none of it depends
 * on the request: no cookie, no header, no search parameter. Without this export
 * Next.js still renders it on demand for every visitor and sends
 * `Cache-Control: private, no-cache, no-store`, so the CDN holds nothing and each
 * visit pays the full round trip to the function. With it the rendered page is
 * stored and served from the edge, on the same one-hour window the data caches
 * already use.
 */
export const revalidate = 3600


export async function generateMetadata(
  { params }: { params: Promise<{ lang: string }> },
): Promise<Metadata> {
  const { lang } = await params
  const language = isLangCode(lang) ? getLanguage(lang) : undefined
  if (!language) return {}
  return pageMetadata({
    title: `Ngữ pháp ${language.name}`,
    description: `Điểm ngữ pháp ${language.name} theo trình độ, kèm cấu trúc và ví dụ.`,
    canonical: `/grammar/${language.code}`,
  })
}

export default async function GrammarLangPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  const language = isLangCode(lang) ? getLanguage(lang) : undefined
  if (!language) notFound()
  const points = await getCachedGrammarPointsByLang(language.code)
  const levels = groupByLevelAndCategory(points)
  return <GrammarPointList language={language} levels={levels} />
}
