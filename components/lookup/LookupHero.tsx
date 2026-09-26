import { Pronunciation } from './Pronunciation'
import { AddToWordlistButton } from './AddToWordlistButton'
import { frequencyBars } from './WordParts'
import { genderLabel } from '@/lib/dictionary/gender'
import type { DictEntryDetail } from '@/lib/dictionary/types'

export function LookupHero({ detail, hanViet, summary, jumps = [], posLabels = [] }: {
  detail: DictEntryDetail
  hanViet?: string | null
  /** The main meanings on one line; see summaryLine. */
  summary?: string | null
  /** Links to the sections below, each with its count. */
  jumps?: { href: string; label: string }[]
  /** The parts of speech the entry's senses carry, in their order. */
  posLabels?: string[]
}) {
  const pinyin = typeof detail.attributes.pinyin === 'string' ? detail.attributes.pinyin : null
  const gender = genderLabel(detail.attributes)
  // The Chinese pronunciation row below already carries the pinyin, so this is only
  // the fallback for an entry with no pronunciation row at all.
  const showPinyin = pinyin !== null && !detail.pronunciations.some((p) => p.ipa?.trim())
  const bars = frequencyBars(detail.frequencyRank)
  return (
    <header className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        <h1 className="min-w-0 break-words text-6xl font-bold leading-[0.9] tracking-tight sm:text-7xl">{detail.headword}</h1>
        {detail.traditional && detail.traditional !== detail.headword && (
          <span className="text-3xl text-black/40">{detail.traditional}</span>
        )}
        <div className="flex flex-col gap-2 pb-1">
          <div className="flex flex-wrap gap-1.5">
            {detail.level && (
              <span className="rounded-full bg-black px-2 py-0.5 text-xs font-semibold text-white">{detail.level}</span>
            )}
            {gender && (
              <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs font-medium text-black/60">{gender}</span>
            )}
            {posLabels.map((p) => (
              <span key={p} className="rounded-full bg-black/5 px-2 py-0.5 text-xs font-medium text-black/60">{p.toLocaleLowerCase('vi')}</span>
            ))}
          </div>
          {bars > 0 && (
            <span
              className="flex items-center gap-2 text-xs font-semibold text-emerald-700"
              title="Nằm trong 3000 từ thông dụng nhất của ngôn ngữ này"
            >
              <span aria-hidden="true" className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <span key={i} className={`h-3 w-1.5 rounded-sm ${i <= bars ? 'bg-emerald-700' : 'bg-black/10'}`} />
                ))}
              </span>
              Hay gặp
            </span>
          )}
        </div>
      </div>
      {(showPinyin || hanViet) && (
        <div className="flex flex-wrap items-center gap-3 text-black/60">
          {showPinyin && <span className="font-medium">{pinyin}</span>}
          {hanViet && <span className="italic">Hán-Việt: {hanViet}</span>}
        </div>
      )}
      <Pronunciation headword={detail.headword} prons={detail.pronunciations} lang={detail.lang} />
      {summary && <p className="text-xl leading-snug text-black/85">{summary}</p>}
      {/* Everything handed to a client component is serialised into the page. The save
          reads the entry fields and a translated example, not every sense, relation and
          sense-linked row: passed whole, take's was 136 kB of the page's 326 kB. */}
      <div>
        <AddToWordlistButton
          entry={{ ...detail, senses: [], relations: [], pronunciations: [], senseLinks: [], examples: detail.examples.filter((e) => e.translationVi) }}
        />
      </div>
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
