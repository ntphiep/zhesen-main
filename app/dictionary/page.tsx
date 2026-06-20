import Link from 'next/link'
import { DictionarySearch } from './DictionarySearch'
import type { LangCode } from '@/lib/content/types'

const VALID: LangCode[] = ['en', 'zh', 'es']

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; lang?: string }> }) {
  const sp = await searchParams
  const lang: LangCode = VALID.includes(sp.lang as LangCode) ? (sp.lang as LangCode) : 'en'
  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/" className="text-sm text-black/50 hover:underline">← Trang chủ</Link>
      <h1 className="mt-3 text-3xl font-bold">Tra cứu</h1>
      <p className="mt-1 text-sm text-black/60">Tra từ để xem nghĩa, phát âm, ví dụ và từ liên quan.</p>
      <div className="mt-6">
        <DictionarySearch initialQuery={sp.q ?? ''} initialLang={lang} />
      </div>
    </main>
  )
}
