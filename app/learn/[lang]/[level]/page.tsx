import { notFound } from 'next/navigation'
import { getLanguage, isLangCode } from '@/lib/languages'
import { getCachedLevelsForLanguage, getCachedEntriesByLevel } from '@/lib/dictionary/cached'
import { LevelWordList } from '@/components/learn/LevelWordList'

const FIRST_PAGE = 40

export default async function LevelPage({ params }: { params: Promise<{ lang: string; level: string }> }) {
  const { lang, level } = await params
  const language = isLangCode(lang) ? getLanguage(lang) : undefined
  if (!language) notFound()

  const levels = await getCachedLevelsForLanguage(language.code)
  const summary = levels.find((l) => l.level === level)
  if (!summary) notFound()

  const page = await getCachedEntriesByLevel(language.code, level, 0, FIRST_PAGE)

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
