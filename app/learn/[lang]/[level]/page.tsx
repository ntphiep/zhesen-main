import { notFound } from 'next/navigation'
import { getLanguage, isLangCode } from '@/lib/languages'
import { getCachedLevelsForLanguage, getCachedEntriesByLevel } from '@/lib/dictionary/cached'
import { LevelWordList } from '@/components/learn/LevelWordList'

import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/site'

/**
 * Empty on purpose. A dynamic segment is only eligible for the full route cache
 * once it declares this function; without it Next.js renders the page for every
 * request and marks the response `private, no-cache, no-store`, which is why
 * repeat visits to the same word never hit the CDN. Returning no params prerenders
 * nothing at build -- the dictionary has 36,361 entries and the vast majority are
 * never opened -- and `dynamicParams` stays at its default, so a word is rendered
 * the first time somebody asks for it and served from the edge afterwards.
 */
export function generateStaticParams(): { lang: string; level: string }[] {
  return []
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
  { params }: { params: Promise<{ lang: string; level: string }> },
): Promise<Metadata> {
  const { lang, level } = await params
  const language = isLangCode(lang) ? getLanguage(lang) : undefined
  if (!language) return {}
  return pageMetadata({
    title: `${level} · ${language.name}`,
    description: `Danh sách từ vựng ${language.name} trình độ ${level}.`,
    canonical: `/learn/${language.code}/${encodeURIComponent(level)}`,
  })
}

const FIRST_PAGE = 40

export default async function LevelPage({ params }: { params: Promise<{ lang: string; level: string }> }) {
  const { lang, level } = await params
  const language = isLangCode(lang) ? getLanguage(lang) : undefined
  if (!language) notFound()

  // The word list does not depend on the level summary; only the notFound() check
  // does. Run both and check afterwards, so a valid level costs one round trip
  // instead of two. An unknown level wastes the second query, which is the rare path.
  const [levels, page] = await Promise.all([
    getCachedLevelsForLanguage(language.code),
    getCachedEntriesByLevel(language.code, level, 0, FIRST_PAGE),
  ])
  const summary = levels.find((l) => l.level === level)
  if (!summary) notFound()

  return (
    <LevelWordList
      language={language}
      level={level}
      levelIsEstimated={summary.levelIsEstimated}
      initialItems={page.items}
      total={page.total}
      pageSize={FIRST_PAGE}
    />
  )
}
