import { notFound } from 'next/navigation'
import { getLanguage, isLangCode } from '@/lib/languages'
import { getCachedLevelsForLanguage, getCachedEntriesByLevel } from '@/lib/dictionary/cached'
import { isLevel } from '@/lib/dictionary/levels'
import { LevelWordList } from '@/components/vocabulary/LevelWordList'

import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/site'
import { levelPageHref } from '@/lib/theory/path'
import { TheoryBreadcrumb } from '@/components/seo/BreadcrumbJsonLd'

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


/** `page` is set only under `[page]`, where `next.config.ts` rewrites `?page=N`. */
type Params = Promise<{ lang: string; level: string; page?: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { lang, level, page } = await params
  const language = isLangCode(lang) ? getLanguage(lang) : undefined
  if (!language) return {}
  const n = pageNumber(page)
  return pageMetadata({
    title: `${level} · ${language.name}${n > 1 ? ` · Trang ${n}` : ''}`,
    description: `Xem danh sách từ vựng ${language.name} trình độ ${level}${n > 1 ? `, trang ${n}` : ''}.`,
    canonical: levelPageHref(language.code, level, n),
  })
}

const PAGE_SIZE = 40

/** 0 for anything but a positive integer, which the page answers with 404. */
function pageNumber(page: string | undefined): number {
  if (page === undefined) return 1
  return /^[1-9][0-9]*$/.test(page) ? Number(page) : 0
}

export default async function LevelPage({ params }: { params: Params }) {
  const { lang, level, page: pageParam } = await params
  const language = isLangCode(lang) ? getLanguage(lang) : undefined
  // A 404 here is cached for the whole revalidate window, so it comes from the fixed
  // level set or an empty level, never from a level list that a cold start got wrong.
  if (!language || !isLevel(language.code, level)) notFound()
  const n = pageNumber(pageParam)
  if (n < 1) notFound()
  const offset = (n - 1) * PAGE_SIZE

  const levelsRead = getCachedLevelsForLanguage(language.code)
  // PostgREST answers an offset past the last row with 416, so a page beyond the level
  // is a 404 decided from the level's count before its rows are read.
  if (n > 1) {
    const known = (await levelsRead).find((l) => l.level === level)
    if (known && offset >= known.count) notFound()
  }
  const [levels, page] = await Promise.all([
    levelsRead,
    getCachedEntriesByLevel(language.code, level, offset, PAGE_SIZE),
  ])
  const summary = levels.find((l) => l.level === level)
  if (!summary) {
    if (page.total === 0) notFound()
    throw new Error(`Level list for ${language.code} lacks ${level}, which holds ${page.total} words`)
  }

  return (
    <>
      <TheoryBreadcrumb language={language} block="vocabulary" leaf={level} />
      <LevelWordList
        key={n}
        language={language}
        level={level}
        levelIsEstimated={summary.levelIsEstimated}
        initialItems={page.items}
        initialStart={offset}
        total={page.total}
        pageSize={PAGE_SIZE}
      />
    </>
  )
}
