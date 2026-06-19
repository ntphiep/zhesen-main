import { AudioButton } from '@/components/AudioButton'
import { AddToWordlistButton } from './AddToWordlistButton'
import type { DictEntryDetail } from '@/lib/dictionary/types'

export function LookupHero({ detail, hanViet }: { detail: DictEntryDetail; hanViet?: string | null }) {
  const pinyin = typeof detail.attributes.pinyin === 'string' ? detail.attributes.pinyin : null
  return (
    <header className="flex flex-col gap-2 border-b border-black/10 pb-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-4xl font-bold">{detail.headword}</h1>
        {detail.traditional && detail.traditional !== detail.headword && (
          <span className="text-2xl text-black/40">{detail.traditional}</span>
        )}
        <AudioButton text={detail.headword} lang={detail.lang} audioUrl={detail.audioUrl} />
        {detail.level && (
          <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs font-medium text-black/60">{detail.level}</span>
        )}
        <div className="ml-auto"><AddToWordlistButton entry={detail} /></div>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-black/60">
        {pinyin && <span className="font-medium">{pinyin}</span>}
        {detail.ipa && <span className="font-mono">{detail.ipa}</span>}
        {hanViet && <span className="italic">Hán-Việt: {hanViet}</span>}
      </div>
    </header>
  )
}
