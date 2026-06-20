import Link from 'next/link'
import { getContentSource } from '@/lib/content'
import { LanguageCard } from '@/components/LanguageCard'

export default async function Home() {
  const languages = await getContentSource().getLanguages()
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-4xl font-bold">Chesen</h1>
      <p className="mt-2 text-black/60">Học tiếng Trung, Tây Ban Nha và Anh.</p>
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {languages.map((l) => (
          <LanguageCard key={l.code} language={l} />
        ))}
      </div>
      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/dictionary" className="inline-block rounded-lg border border-black/15 px-4 py-2 hover:bg-black/5">
          Tra cứu
        </Link>
        <Link href="/wordlist" className="inline-block rounded-lg bg-black px-4 py-2 text-white">
          Danh sách từ của tôi
        </Link>
      </div>
    </main>
  )
}
