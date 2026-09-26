import { Pronunciation } from './Pronunciation'
import { AddToWordlistButton } from './AddToWordlistButton'
import { genderLabel } from '@/lib/dictionary/gender'
import type { DictEntryDetail } from '@/lib/dictionary/types'

export function LookupHero({ detail, hanViet, summary, jumps = [] }: {
  detail: DictEntryDetail
  hanViet?: string | null
  /** The main meanings on one line; see summaryLine. */
  summary?: string | null
  /** Links to the sections below, each with its count. */
  jumps?: { href: string; label: string }[]
}) {
  const pinyin = typeof detail.attributes.pinyin === 'string' ? detail.attributes.pinyin : null
  const gender = genderLabel(detail.attributes)
  // The Chinese pronunciation row below already carries the pinyin, so this is only
  // the fallback for an entry with no pronunciation row at all.
  const showPinyin = pinyin !== null && !detail.pronunciations.some((p) => p.ipa?.trim())
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 break-words text-5xl font-bold">{detail.headword}</h1>
        {detail.traditional && detail.traditional !== detail.headword && (
          <span className="text-2xl text-black/40">{detail.traditional}</span>
        )}
        {gender && (
          <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs font-medium text-black/60">{gender}</span>
        )}
        {detail.level && (
          <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs font-medium text-black/60">{detail.level}</span>
        )}
        {detail.frequencyRank != null && detail.frequencyRank <= 3000 && (
          <span
            className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
            title="Nằm trong 3000 từ thông dụng nhất của ngôn ngữ này"
          >
            Hay gặp
          </span>
        )}
        <div className="ml-auto"><AddToWordlistButton entry={detail} /></div>
      </div>
      {(showPinyin || hanViet) && (
        <div className="flex flex-wrap items-center gap-3 text-black/60">
          {showPinyin && <span className="font-medium">{pinyin}</span>}
          {hanViet && <span className="italic">Hán-Việt: {hanViet}</span>}
        </div>
      )}
      <Pronunciation headword={detail.headword} prons={detail.pronunciations} lang={detail.lang} />
      {summary && <p className="text-lg text-black/80">{summary}</p>}
      {jumps.length > 0 && (
        <nav aria-label="Mục trong trang" className="flex flex-wrap gap-2">
          {jumps.map((j) => (
            <a key={j.href} href={j.href} className="rounded-full bg-black/5 px-3 py-1 text-sm font-medium text-black/75 hover:bg-black/10">
              {j.label}
            </a>
          ))}
        </nav>
      )}
    </header>
  )
}
