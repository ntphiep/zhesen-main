import { notFound } from 'next/navigation'
import { getContentSource } from '@/lib/content'
import type { LangCode } from '@/lib/content/types'
import { createClient } from '@/lib/supabase/server'
import { SupabaseProgressStore } from '@/lib/progress/SupabaseProgressStore'
import { LangDashboard } from './LangDashboard'

const VALID: LangCode[] = ['zh', 'es', 'en']

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  if (!VALID.includes(lang as LangCode)) notFound()
  const code = lang as LangCode
  const src = getContentSource()
  const [language, lessons] = await Promise.all([
    src.getLanguages().then((ls) => ls.find((l) => l.code === code)!),
    src.getLessons(code),
  ])
  const store = new SupabaseProgressStore(await createClient())
  const due = await store.countDue(code, Date.now())
  return <LangDashboard language={language} lessons={lessons} due={due} />
}
