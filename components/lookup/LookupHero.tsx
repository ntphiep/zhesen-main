import { Pronunciation } from './Pronunciation'
import { AddToWordlistButton } from './AddToWordlistButton'
import { FrequencyMeter, LevelChip } from './WordParts'
import { genderLabel } from '@/lib/dictionary/gender'
import type { DictEntryDetail } from '@/lib/dictionary/types'

/** Headword sizes by length, phone then wide screen, so a long word keeps to its card. */
const SIZES: [number, string][] = [
  [6, 'text-[64px] sm:text-[92px]'],
  [9, 'text-[52px] sm:text-[72px]'],
  [12, 'text-[42px] sm:text-[56px]'],
]
const headwordSize =(word: string) => SIZES.find(([n]) => word.length <= n)?.[1] ?? 'text-[34px] sm:text-[44px]'

const CHIP = 'rounded-full bg-(--zs-bg) px-[9px] py-[3px] text-xs text-(--zs-soft)'

/** Everything handed to a client component is serialised into the page. The save reads
 *  the entry fields and a translated example, not every sense, relation and sense-linked
 *  row: passed whole, take's was 136 kB of the page's 326 kB. */
export function saveableEntry(detail: DictEntryDetail): DictEntryDetail {
  return { ...detail, senses: [], relations: [], pronunciations: [], senseLinks: [], examples: detail.examples.filter((e) => e.translationVi) }
}

export function LookupHero({ detail, hanViet, summary, stats = [], posLabels = [] }: {
  detail: DictEntryDetail
  hanViet?: string | null
  /** The main meanings on one line; see summaryLine. */
  summary?: string | null
  /** Counts under the summary, each a number and what it counts. */
  stats?: { n: number; label: string }[]
  /** The parts of speech the entry's senses carry, in their order. */
  posLabels?: string[]
}) {
  const pinyin = typeof detail.attributes.pinyin === 'string' ? detail.attributes.pinyin : null
  const gender = genderLabel(detail.attributes)
  // The Chinese pronunciation row below already carries the pinyin, so this is only
  // the fallback for an entry with no pronunciation row at all.
  const showPinyin = pinyin !== null && !detail.pronunciations.some((p) => p.ipa?.trim())
  return (
    <header className="flex flex-1 flex-col gap-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <h1 data-hw="" lang={detail.lang} className={`min-w-0 break-words leading-[0.82] ${headwordSize(detail.headword)}`}>
          {detail.headword}
        </h1>
        {detail.traditional && detail.traditional !== detail.headword && (
          <span data-hw="" lang="zh" className="text-4xl text-(--zs-soft)">{detail.traditional}</span>
        )}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            <LevelChip level={detail.level} strong />
            {gender && <span className={CHIP}>{gender}</span>}
            {posLabels.map((p) => <span key={p} className={CHIP}>{p.toLocaleLowerCase('vi')}</span>)}
          </div>
          <FrequencyMeter rank={detail.frequencyRank} />
        </div>
      </div>
      {(showPinyin || hanViet) && (
        <div className="flex flex-wrap items-center gap-3 text-(--zs-soft)">
          {showPinyin && <span className="font-medium">{pinyin}</span>}
          {hanViet && <span className="italic">Hán-Việt: {hanViet}</span>}
        </div>
      )}
      <Pronunciation headword={detail.headword} prons={detail.pronunciations} lang={detail.lang} pill />
      {summary && <p className="text-lg leading-snug sm:text-[21px]">{summary}</p>}
      {stats.length > 0 && (
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-(--zs-soft)">
          {stats.map((s) => <span key={s.label}><b className="font-semibold text-(--zs-ink)">{s.n}</b> {s.label}</span>)}
        </p>
      )}
      <div className="mt-auto pt-1">
        <AddToWordlistButton size="lg" entry={saveableEntry(detail)} />
      </div>
    </header>
  )
}
