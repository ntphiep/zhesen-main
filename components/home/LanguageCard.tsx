import Link from 'next/link'
import type { Language } from '@/lib/languages'

export function LanguageCard({ language }: { language: Language }) {
  return (
    <Link
      href={`/learn/${language.code}`}
      className="group flex flex-col rounded-2xl border border-black/10 p-6 transition hover:border-black/30 hover:shadow-lg hover:-translate-y-0.5"
    >
      <div className="text-3xl font-semibold">{language.nativeName}</div>
      <div className="mt-1 text-sm text-black/60">{language.name}</div>
      <div className="mt-4 text-sm font-medium text-black/40 transition group-hover:text-black/70">Vào học →</div>
    </Link>
  )
}
