import { notFound } from 'next/navigation'
import { getContentSource } from '@/lib/content'
import { getCachedCommonWords } from '@/lib/dictionary/cached'
import type { LangCode } from '@/lib/content/types'
import { LanguageHub } from './LanguageHub'

const VALID: LangCode[] = ['zh', 'es', 'en']

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  if (!VALID.includes(lang as LangCode)) notFound()
  const code = lang as LangCode
  const [languages, common] = await Promise.all([
    getContentSource().getLanguages(),
    getCachedCommonWords(code),
  ])
  const language = languages.find((l) => l.code === code)!
  return <LanguageHub language={language} common={common} />
}
