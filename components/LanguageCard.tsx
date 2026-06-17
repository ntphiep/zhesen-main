import Link from 'next/link'
import type { Language } from '@/lib/content/types'

export function LanguageCard({ language }: { language: Language }) {
  return (
    <Link
      href={`/learn/${language.code}`}
      className="block rounded-2xl border border-black/10 p-6 transition hover:shadow-lg hover:-translate-y-0.5"
    >
      <div className="text-3xl font-semibold">{language.nativeName}</div>
      <div className="mt-1 text-sm text-black/60">{language.name}</div>
    </Link>
  )
}
