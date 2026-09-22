import Link from 'next/link'
import { LANGUAGES } from '@/lib/languages'
import { LanguageCard } from '@/components/home/LanguageCard'
import { WordOfDayCard } from '@/components/home/WordOfDayCard'
import { LookupPair } from '@/components/search/LookupPair'
import { getCachedWordOfDay } from '@/lib/dictionary/cached'

const SECTIONS = [
  { href: '/dictionary', title: 'Dịch', desc: 'Nghĩa, phát âm, ví dụ, cả đoạn' },
  { href: '/grammar', title: 'Ngữ pháp', desc: 'Điểm ngữ pháp theo cấp độ, có ví dụ' },
  { href: '/practice', title: 'Luyện tập', desc: 'Ôn từ, kiểm tra, nghe & nói' },
  { href: '/wordlist', title: 'Sổ tay', desc: 'Từ vựng bạn đã lưu' },
]

export default async function Home() {
  const languages = LANGUAGES
  const wordOfDay = await getCachedWordOfDay()
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-4xl font-bold">Zhesen</h1>
      <p className="mt-2 text-black/60">Học tiếng Trung, Tây Ban Nha và Anh.</p>
      <div className="mt-8">
        <LookupPair />
      </div>
      <div className="mt-6">
        <WordOfDayCard word={wordOfDay} />
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
