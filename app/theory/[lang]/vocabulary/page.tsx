import { notFound } from 'next/navigation'
import { LANG_CODES, getLanguage, isLangCode } from '@/lib/languages'
import { getCachedCommonWords, getCachedLevelsForLanguage } from '@/lib/dictionary/cached'
import { VocabularyHub } from '@/components/vocabulary/VocabularyHub'

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
// One week, the literal value of `LEX_REVALIDATE` in `lib/dictionary/cached.ts`,
// which the data caches under this page use and which explains the figure. Written
// out because a segment config must be statically analysable: importing the constant
// fails the build with "Invalid segment configuration export detected".
export const revalidate = 604800


export async function generateMetadata(
  { params }: { params: Promise<{ lang: string }> },
): Promise<Metadata> {
  const { lang } = await params
  const language = isLangCode(lang) ? getLanguage(lang) : undefined
  if (!language) return {}
  return pageMetadata({
    title: `Từ vựng ${language.name}`,
    description: `Xem từ thông dụng và danh sách từ vựng ${language.name} theo trình độ.`,
    canonical: `/theory/${language.code}/vocabulary`,
  })
}

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  const language = isLangCode(lang) ? getLanguage(lang) : undefined
  if (!language) notFound()
  const [common, levels] = await Promise.all([
    getCachedCommonWords(language.code),
    getCachedLevelsForLanguage(language.code),
  ])
  return <VocabularyHub language={language} common={common} levels={levels} />
}
