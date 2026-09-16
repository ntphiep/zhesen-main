import { notFound } from 'next/navigation'
import { getLanguage, isLangCode } from '@/lib/languages'
import { getCachedLevelsForLanguage, getCachedEntriesByLevel } from '@/lib/dictionary/cached'
import { LevelWordList } from '@/components/learn/LevelWordList'

import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/site'

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
