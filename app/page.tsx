import Link from 'next/link'
import { getContentSource } from '@/lib/content'
import { LanguageCard } from '@/components/LanguageCard'
import { WordOfDayCard } from '@/components/WordOfDayCard'
import { SearchBox } from '@/components/search/SearchBox'
import { getCachedWordOfDay } from '@/lib/dictionary/cached'
import { dayNumber } from '@/lib/dictionary/wordOfDay'

const SECTIONS = [
  { href: '/dictionary', title: 'Tra cứu', desc: 'Tìm nghĩa, phát âm, ví dụ' },
  { href: '/practice', title: 'Luyện tập', desc: 'Ôn từ, kiểm tra, nghe & nói' },
  { href: '/wordlist', title: 'Sổ tay', desc: 'Từ vựng bạn đã lưu' },
]

export default async function Home() {
  const [languages, wordOfDay] = await Promise.all([
    getContentSource().getLanguages(),
    getCachedWordOfDay(dayNumber(Date.now())),
  ])
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-4xl font-bold">Chesen</h1>
      <p className="mt-2 text-black/60">Học tiếng Trung, Tây Ban Nha và Anh.</p>
      <div className="mt-8">
        <SearchBox />
      </div>
      <div className="mt-6">
        <WordOfDayCard word={wordOfDay} />
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="group rounded-2xl border border-black/10 p-5 transition hover:border-black/30 hover:shadow-lg hover:-translate-y-0.5"
          >
            <div className="text-lg font-semibold">{s.title}</div>
            <div className="mt-1 text-sm text-black/55">{s.desc}</div>
          </Link>
        ))}
      </div>

      <h2 className="mt-10 mb-3 text-sm font-semibold uppercase tracking-wide text-black/40">Học theo ngôn ngữ</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {languages.map((l) => (
          <LanguageCard key={l.code} language={l} />
        ))}
      </div>
    </main>
  )
}
