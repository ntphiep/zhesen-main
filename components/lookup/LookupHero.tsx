import { Pronunciation } from './Pronunciation'
import { AddToWordlistButton } from './AddToWordlistButton'
import { genderLabel } from '@/lib/dictionary/gender'
import type { DictEntryDetail } from '@/lib/dictionary/types'

export function LookupHero({ detail, hanViet }: { detail: DictEntryDetail; hanViet?: string | null }) {
  const pinyin = typeof detail.attributes.pinyin === 'string' ? detail.attributes.pinyin : null
  const gender = genderLabel(detail.attributes)
  return (
    <header className="flex flex-col gap-3 border-b border-black/10 pb-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-4xl font-bold">{detail.headword}</h1>
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
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Thông dụng</span>
        )}
        <div className="ml-auto"><AddToWordlistButton entry={detail} /></div>
      </div>
      {(pinyin || hanViet) && (
        <div className="flex flex-wrap items-center gap-3 text-black/60">
          {pinyin && <span className="font-medium">{pinyin}</span>}
          {hanViet && <span className="italic">Hán-Việt: {hanViet}</span>}
        </div>
      )}
      <Pronunciation headword={detail.headword} prons={detail.pronunciations} lang={detail.lang} />
    </header>
  )
}
