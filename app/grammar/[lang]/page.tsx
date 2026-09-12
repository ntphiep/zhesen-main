import { notFound } from 'next/navigation'
import { getLanguage, isLangCode } from '@/lib/languages'
import { getCachedGrammarPointsByLang } from '@/lib/grammar/cached'
import { groupByLevelAndCategory } from '@/lib/grammar/group'
import { GrammarPointList } from '@/components/grammar/GrammarPointList'

export default async function GrammarLangPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  const language = isLangCode(lang) ? getLanguage(lang) : undefined
  if (!language) notFound()
  const points = await getCachedGrammarPointsByLang(language.code)
  const levels = groupByLevelAndCategory(points)
  return <GrammarPointList language={language} levels={levels} />
}
