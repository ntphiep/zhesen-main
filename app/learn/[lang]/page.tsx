import { notFound } from 'next/navigation'
import { getLanguage, isLangCode } from '@/lib/languages'
import { getCachedCommonWords, getCachedLevelsForLanguage } from '@/lib/dictionary/cached'
import { LanguageHub } from '@/components/learn/LanguageHub'

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
