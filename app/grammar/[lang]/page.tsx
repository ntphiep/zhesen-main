import { notFound } from 'next/navigation'
import { getLanguage, isLangCode } from '@/lib/languages'
import { getCachedGrammarPointsByLang } from '@/lib/grammar/cached'
import { groupByLevelAndCategory } from '@/lib/grammar/group'
import { GrammarPointList } from '@/components/grammar/GrammarPointList'

import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/site'

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
