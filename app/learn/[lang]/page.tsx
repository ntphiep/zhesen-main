import { notFound } from 'next/navigation'
import { getLanguage, isLangCode } from '@/lib/languages'
import { getCachedCommonWords, getCachedLevelsForLanguage } from '@/lib/dictionary/cached'
import { LanguageHub } from '@/components/learn/LanguageHub'

import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/site'

export async function generateMetadata(
  { params }: { params: Promise<{ lang: string }> },
): Promise<Metadata> {
  const { lang } = await params
  const language = isLangCode(lang) ? getLanguage(lang) : undefined
  if (!language) return {}
  return pageMetadata({
    title: `Học ${language.name}`,
    description: `Từ thông dụng và danh sách từ vựng ${language.name} theo trình độ.`,
    canonical: `/learn/${language.code}`,
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
  return <LanguageHub language={language} common={common} levels={levels} />
}
