import { getContentSource } from '@/lib/content'
import { LanguageCard } from '@/components/LanguageCard'
import { SearchBox } from '@/components/search/SearchBox'

export default async function Home() {
  const languages = await getContentSource().getLanguages()
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-4xl font-bold">Chesen</h1>
      <p className="mt-2 text-black/60">Học tiếng Trung, Tây Ban Nha và Anh.</p>
      <div className="mt-8">
        <SearchBox />
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {languages.map((l) => (
          <LanguageCard key={l.code} language={l} />
        ))}
      </div>
    </main>
  )
}
