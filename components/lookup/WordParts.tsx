'use client'
import { useState } from 'react'
import Link from 'next/link'
import { LinkPending } from '@/components/ui/LinkPending'
import { PosTag } from '@/components/ui/PosTag'
import { AudioButton } from '@/components/ui/AudioButton'
import { AiCoach } from '@/components/ai/AiCoach'
import { TappableText } from '@/components/reader/TappableText'
import { useAnchor } from '@/lib/hooks/useAnchor'
import { searchPath } from '@/lib/dictionary/entryId'
import { grammarPointPath } from '@/lib/grammar/path'
import { posGroups, splitPos } from '@/lib/dictionary/pos'
import { isSentenceTranslation } from '@/lib/dictionary/textQuality'
import { splitPhrasalVerbs, type FamilyWord, type ViewForm, type ViewWord, type WordView } from '@/lib/dictionary/wordView'
import type { ResolvedText } from '@/lib/dictionary/tappable'
import type { DictExample } from '@/lib/dictionary/types'
import type { GrammarPoint } from '@/lib/grammar/types'
import type { LangCode } from '@/lib/languages'

/** Pieces the three word-page layouts share. Sizes and colours follow the drawn designs. */

/** The same width as every other page and the header. */
export const CONTAINER = 'mx-auto w-full max-w-page px-4 sm:px-6'

export function WordLink({ word, className = '', children }: {
  word: Pick<ViewWord, 'text' | 'href'> & { gloss?: string | null }
  className?: string
  children?: React.ReactNode
}) {
  return (
    <Link href={word.href} className={className} title={children ? undefined : word.gloss ?? undefined}>
      {children ?? word.text}
      <LinkPending />
    </Link>
  )
}

export function SectionLabel({ children, className = '', as: Heading = 'h2' }: {
  children: React.ReactNode
  className?: string
  as?: 'h2' | 'h3'
}) {
  return <Heading className={`text-[11.5px] font-semibold uppercase tracking-[0.07em] text-black/55 ${className}`}>{children}</Heading>
}

export const CARD = 'rounded-[18px] border border-black/[0.08] bg-white'

/** A white card on the overview's grey page. `label` is a string for the small-caps
 *  heading, or a node when the heading carries more. */
export function Card({ label, id, action, className = '', children }: {
  label?: React.ReactNode
  id?: string
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  const anchor = useAnchor()
  return (
    <section id={id && anchor(id)} className={`flex min-w-0 flex-col gap-3.5 p-5 max-lg:scroll-mt-16 sm:p-6 ${CARD} ${className}`}>
      {(label || action) && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          {typeof label === 'string' ? <SectionLabel>{label}</SectionLabel> : label}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

const BADGE = {
  amber: 'bg-amber-50 text-amber-700',
  emerald: 'bg-emerald-50 text-emerald-700',
  neutral: 'bg-black/[0.05] text-black/70',
} as const

export function Badge({ tone = 'neutral', children }: { tone?: keyof typeof BADGE; children: React.ReactNode }) {
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${BADGE[tone]}`}>{children}</span>
}

export function LevelChip({ level, strong = false }: { level: string | null; strong?: boolean }) {
  if (!level) return null
  return (
    <span
      className={`shrink-0 rounded-full font-semibold ${
        strong ? 'bg-black px-[9px] py-[3px] text-xs text-white' : 'bg-black/[0.05] px-[7px] py-0.5 text-[11px] text-black/75'
      }`}
    >
      {level}
    </span>
  )
}

/** Marks a Vietnamese meaning inferred through English rather than written for the word. */
export function PivotMark() {
  return (
    <span className="ml-1 align-middle text-[10px] font-normal uppercase tracking-wide text-amber-700/70" title="Nghĩa suy ra qua tiếng Anh">
      qua tiếng Anh
    </span>
  )
}

/** A part of speech spelled out, as a small grey chip. */
export function PosChip({ value }: { value: string | null | undefined }) {
  return <PosTag full value={value} className="shrink-0 rounded-full bg-black/[0.05] px-[7px] py-0.5 text-[11px] text-black/55" />
}

/** Five bars for a word in the 3,000 most common, fewer the further down it ranks. */
export function frequencyBars(rank: number | null | undefined): number {
  if (rank == null || rank > 3000) return 0
  return rank <= 500 ? 5 : rank <= 1000 ? 4 : 3
}

export function FrequencyMeter({ rank, small = false }: { rank: number | null | undefined; small?: boolean }) {
  const bars = frequencyBars(rank)
  if (bars === 0) return null
  return (
    <span className="flex items-center gap-2 text-xs font-semibold text-emerald-700" title="Nằm trong 3000 từ thông dụng nhất của ngôn ngữ này">
      <span aria-hidden="true" className="flex gap-[3px]">
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={`rounded-[2px] ${small ? 'h-3 w-[5px]' : 'h-3.5 w-1.5'} ${i <= bars ? 'bg-emerald-700' : 'bg-black/10'}`} />
        ))}
      </span>
      Hay gặp
    </span>
  )
}

/** What the first cell of the forms calls the headword. */
export function baseFormLabel(pos: string | null): string {
  return posGroups(splitPos(pos)).some((g) => g.key === 'verb') ? 'Nguyên thể' : 'Dạng gốc'
}

/** mis|take: the part outside the stem in violet, the stem in bold ink. */
export function MorphText({ word }: { word: Pick<FamilyWord, 'before' | 'stem' | 'after'> }) {
  return (
    <>
      {word.before && <span className="font-semibold text-violet-700">{word.before}</span>}
      <span className="font-bold">{word.stem}</span>
      {word.after && <span className="font-semibold text-violet-700">{word.after}</span>}
    </>
  )
}

/** t|ook: what a form keeps of the headword in ink, what changes in colour, amber when
 *  the change breaks the rules. */
function FormText({ form }: { form: ViewForm }) {
  return (
    <>
      {form.kept}
      <span className={`font-bold ${form.irregular ? 'text-amber-700' : 'text-emerald-700'}`}>{form.changed}</span>
      {form.irregular && <span className="sr-only"> (bất quy tắc)</span>}
    </>
  )
}

export function MoreButton({ expanded, label, onClick, className = '' }: {
  expanded: boolean
  label: string
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      className={`w-fit text-left text-[13px] font-semibold text-blue-700 hover:underline ${className}`}
    >
      {expanded ? 'Thu gọn' : label}
    </button>
  )
}

export function WordChip({ word, tone = 'blue' }: { word: ViewWord; tone?: 'blue' | 'rose' }) {
  const colours = tone === 'rose' ? 'bg-rose-50 text-rose-700' : 'bg-blue-50 text-blue-700'
  return <WordLink word={word} className={`rounded-full px-[11px] py-1 text-[13px] font-medium hover:underline ${colours}`} />
}

export function ChipRow({ words, tone, shown = 8 }: { words: ViewWord[]; tone?: 'blue' | 'rose'; shown?: number }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? words : words.slice(0, shown)
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visible.map((w) => <WordChip key={w.text} word={w} tone={tone} />)}
      {words.length > shown && (
        <MoreButton expanded={expanded} label={`Xem thêm ${words.length - shown}`} onClick={() => setExpanded((v) => !v)} className="px-1" />
      )}
    </div>
  )
}

/** A word with its meaning beside it, in an outlined chip. */
function GlossChip({ word, tone = 'blue' }: { word: ViewWord; tone?: 'blue' | 'rose' }) {
  return (
    <WordLink
      word={word}
      className="inline-flex max-w-full items-baseline gap-1.5 rounded-lg border border-black/10 px-[11px] py-[5px] text-[13px] hover:bg-black/[0.03]"
    >
      <span className={`shrink-0 font-semibold ${tone === 'rose' ? 'text-rose-700' : 'text-blue-700'}`}>{word.text}</span>
      {word.gloss && <span className="truncate text-black/55">{word.gloss}</span>}
    </WordLink>
  )
}

export function GlossChips({ words, tone, shown = 8 }: { words: ViewWord[]; tone?: 'blue' | 'rose'; shown?: number }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? words : words.slice(0, shown)
  return (
    <div className="flex flex-wrap items-center gap-2">
      {visible.map((w) => <GlossChip key={w.text} word={w} tone={tone} />)}
      {words.length > shown && (
        <MoreButton expanded={expanded} label={`Xem thêm ${words.length - shown}`} onClick={() => setExpanded((v) => !v)} className="px-1" />
      )}
    </div>
  )
}

/** "Phân từ II" inside a sentence: only the first letter drops, the numeral stays. */
const lowerFirst = (label: string) => label.charAt(0).toLocaleLowerCase('vi') + label.slice(1)

/** "Lưu ý": which forms break the rules, under the forms. */
export function IrregularNote({ forms }: { forms: ViewForm[] }) {
  const labels = forms.filter((f) => f.irregular).map((f, i) => (i === 0 ? f.label : lowerFirst(f.label)))
  if (labels.length === 0) return null
  const list = labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(', ')} và ${labels[labels.length - 1]}`
  return (
    <p className="flex flex-wrap items-center gap-2 border-t border-black/[0.06] pt-4 text-[13px]">
      <Badge tone="amber">Lưu ý</Badge>
      {list} không theo quy tắc.
    </p>
  )
}

export function FormLegend({ irregular }: { irregular: boolean }) {
  return (
    <span className="flex gap-3.5 text-xs text-black/55">
      <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-emerald-700" />theo quy tắc</span>
      {irregular && <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-amber-700" />bất quy tắc</span>}
    </span>
  )
}

type FormItem = { text: string; label: string; base: true } | (ViewForm & { base: false })

/** Dạng từ as a line of stops from the headword: across on a wide screen, down on a phone. */
export function FormTimeline({ headword, baseLabel, forms, lang }: {
  headword: string
  baseLabel: string
  forms: ViewForm[]
  lang: LangCode
}) {
  const items: FormItem[] = [{ text: headword, label: baseLabel, base: true }, ...forms.map((f) => ({ ...f, base: false as const }))]
  return (
    <ol className="ml-1 grid gap-4 border-l-2 border-black/10 pl-5 sm:ml-0 sm:grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] sm:gap-x-0 sm:gap-y-6 sm:border-0 sm:pl-0">
      {items.map((f, i) => (
        <li key={f.text} className="relative flex items-center justify-between gap-3 sm:flex-col sm:items-stretch sm:justify-start sm:gap-2.5">
          <span aria-hidden="true" className="absolute top-1/2 -left-[26px] -translate-y-1/2 sm:static sm:flex sm:translate-y-0 sm:items-center">
            <span className={`block size-2.5 shrink-0 rounded-full ${f.base ? 'bg-black' : f.irregular ? 'bg-amber-700' : 'bg-emerald-700'}`} />
            {i < items.length - 1 && <span className="hidden h-0.5 flex-1 bg-black/10 sm:block" />}
          </span>
          {f.base
            ? <span className="pr-3 text-2xl font-bold tracking-[-0.02em] sm:text-[26px]">{f.text}</span>
            : (
              <Link href={searchPath(lang, f.text)} className="pr-3 text-2xl font-semibold tracking-[-0.02em] hover:underline sm:text-[26px]">
                <FormText form={f} />
              </Link>
            )}
          <span className="text-xs text-black/55">{f.label}</span>
        </li>
      ))}
    </ol>
  )
}

/** Dạng từ as a row of outlined cells. `wide` leads with the headword and fills an
 *  irregular cell amber; `compact` puts the name above each form with its sound. */
export function FormCells({ headword, baseLabel, forms, lang, variant }: {
  headword: string
  baseLabel: string
  forms: ViewForm[]
  lang: LangCode
  variant: 'wide' | 'compact'
}) {
  const items: FormItem[] = [
    ...(variant === 'wide' ? [{ text: headword, label: baseLabel, base: true as const }] : []),
    ...forms.map((f) => ({ ...f, base: false as const })),
  ]
  return (
    <div className="grid overflow-hidden rounded-xl border border-black/10 sm:grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] [&>*+*]:border-t [&>*+*]:border-black/10 sm:[&>*+*]:border-t-0 sm:[&>*+*]:border-l">
      {items.map((f) => {
        const form = f.base
          ? <span className="font-bold">{f.text}</span>
          : <Link href={searchPath(lang, f.text)} className="font-semibold hover:underline"><FormText form={f} /></Link>
        return variant === 'wide' ? (
          <div key={f.text} className={`flex flex-col gap-1.5 px-4 py-3.5 ${!f.base && f.irregular ? 'bg-amber-50' : ''}`}>
            <span className="text-2xl tracking-[-0.02em]">{form}</span>
            <span className="text-[13px] text-black/55">{lowerFirst(f.label)}</span>
          </div>
        ) : (
          <div key={f.text} className="flex flex-col gap-1 px-4 py-3">
            <span className="text-xs text-black/55">{f.label}</span>
            <span className="flex items-center gap-1 text-lg">{form}<AudioButton text={f.text} lang={lang} /></span>
          </div>
        )
      })}
    </div>
  )
}

function SynonymRow({ label, words, tone = 'blue' }: { label: string; words: ViewWord[]; tone?: 'blue' | 'rose' }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[6rem_minmax(0,1fr)] sm:items-baseline sm:gap-3">
      <span className={`truncate text-[13px] ${tone === 'rose' ? 'font-semibold text-rose-700' : 'text-black/55'}`} title={label}>{label}</span>
      <ChipRow words={words} tone={tone} shown={6} />
    </div>
  )
}

/** Synonyms under the sense they share a meaning with, then the rest, then antonyms. */
export function SynonymsRows({ view, shownRows = 4 }: {
  view: Pick<WordView, 'senseSynonyms' | 'synonyms' | 'antonyms'>
  shownRows?: number
}) {
  const [expanded, setExpanded] = useState(false)
  const rows = [
    ...view.senseSynonyms.map((s) => ({ key: `s${s.senseOrder}`, label: s.label, words: s.words })),
    ...(view.synonyms.length > 0
      ? [{ key: 'other', label: view.senseSynonyms.length > 0 ? 'Khác' : 'Đồng nghĩa', words: view.synonyms }]
      : []),
  ]
  const visible = expanded ? rows : rows.slice(0, shownRows)
  return (
    <div className="flex flex-col gap-3.5">
      {visible.map((r) => <SynonymRow key={r.key} label={r.label} words={r.words} />)}
      {rows.length > shownRows && (
        <MoreButton expanded={expanded} label={`Xem thêm ${rows.length - shownRows} nhóm`} onClick={() => setExpanded((v) => !v)} />
      )}
      {view.antonyms.length > 0 && (
        <div className={rows.length > 0 ? 'border-t border-black/[0.06] pt-3.5' : ''}>
          <SynonymRow label="Trái nghĩa" words={view.antonyms} tone="rose" />
        </div>
      )}
    </div>
  )
}

export const hasSynonyms = (v: Pick<WordView, 'senseSynonyms' | 'synonyms' | 'antonyms'>) =>
  v.senseSynonyms.length + v.synonyms.length + v.antonyms.length > 0

/** A word list as a table with a header: the word, its part of speech, its meaning and,
 *  for the family, its level. On a phone the part of speech moves under the word. */
export function WordTable({ words, head, family = false, level = false, shown = 8 }: {
  words: (ViewWord | FamilyWord)[]
  head: string
  family?: boolean
  level?: boolean
  shown?: number
}) {
  const [expanded, setExpanded] = useState(false)
  if (words.length === 0) return null
  const rows = expanded ? words : words.slice(0, shown)
  return (
    <div className="flex flex-col gap-2.5">
      <div className="overflow-hidden rounded-[10px] border border-black/10">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-black/[0.04] text-left text-xs font-semibold text-black/55">
            <tr>
              <th scope="col" className="px-3.5 py-2 font-semibold">{head}</th>
              <th scope="col" className="hidden px-3.5 py-2 font-semibold sm:table-cell">Từ loại</th>
              <th scope="col" className="px-3.5 py-2 font-semibold">Nghĩa</th>
              {level && <th scope="col" className="w-px whitespace-nowrap px-3.5 py-2 font-semibold">Trình độ</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => (
              <tr key={w.text} className="border-t border-black/10 align-baseline">
                <td className="px-3.5 py-2.5">
                  <WordLink word={w} className={`font-semibold hover:underline ${family ? '' : 'text-blue-700'}`}>
                    {family && 'stem' in w ? <MorphText word={w} /> : w.text}
                  </WordLink>
                  <PosTag full value={w.pos} className="block text-xs text-black/45 sm:hidden" />
                </td>
                <td className="hidden whitespace-nowrap px-3.5 py-2.5 text-black/55 sm:table-cell"><PosTag full value={w.pos} /></td>
                <td className={`px-3.5 py-2.5 ${w.gloss ? 'text-black/80' : 'text-black/35'}`}>{w.gloss ?? 'Chưa có nghĩa'}</td>
                {level && <td className="px-3.5 py-2.5 text-right"><LevelChip level={w.level} /></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {words.length > shown && (
        <MoreButton
          expanded={expanded}
          label={`Xem thêm ${words.length - shown} ${head.toLocaleLowerCase('vi')}`}
          onClick={() => setExpanded((v) => !v)}
        />
      )}
    </div>
  )
}

/** The overview's phrases: English phrasal verbs as cards keyed by their particle, the
 *  other phrases as chips, and every phrase as a table on request. */
export function PhrasesCard({ headword, lang, phrases }: { headword: string; lang: LangCode; phrases: ViewWord[] }) {
  const [all, setAll] = useState(false)
  const { phrasal, other } = lang === 'en' ? splitPhrasalVerbs(headword, phrases) : { phrasal: [], other: phrases }
  if (phrasal.length === 0) {
    return <Card id="phrases" label="Cụm từ"><WordTable words={other} head="Cụm từ" /></Card>
  }
  const cards = phrasal.slice(0, 8)
  const chips = other.slice(0, 6)
  const hidden = phrases.length - cards.length - chips.length
  return (
    <Card
      id="phrases"
      label="Cụm động từ"
      action={hidden > 0 && <MoreButton expanded={all} label={`Cả ${phrases.length} cụm từ`} onClick={() => setAll((v) => !v)} />}
    >
      {all ? <WordTable words={phrases} head="Cụm từ" shown={phrases.length} /> : (
        <>
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {cards.map((w) => (
              <li key={w.text} className="min-w-0">
                <WordLink word={w} className="flex h-full flex-col gap-0.5 rounded-[14px] bg-black/[0.04] p-3.5 hover:bg-black/[0.07]">
                  <span className="text-xs text-black/55">{headword}</span>
                  <span className="text-2xl font-bold leading-tight tracking-[-0.02em] text-blue-700">{w.particle}</span>
                  <span className={`line-clamp-2 text-[13px] leading-[1.35] ${w.gloss ? '' : 'text-black/35'}`}>{w.gloss ?? 'Chưa có nghĩa'}</span>
                </WordLink>
              </li>
            ))}
          </ul>
          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-xs font-semibold text-black/55">Cụm từ khác</span>
              {chips.map((w) => <GlossChip key={w.text} word={w} />)}
            </div>
          )}
        </>
      )}
    </Card>
  )
}

/** Họ từ as rows: the word with the part it adds in violet, its meaning over its part of
 *  speech, and its level. Words that share the root follow as chips. */
export function FamilyRows({ family, related, shown = 6 }: { family: FamilyWord[]; related: ViewWord[]; shown?: number }) {
  const [expanded, setExpanded] = useState(false)
  const rows = expanded ? family : family.slice(0, shown)
  // A card under 20rem, as in the side panels of the map and the reading page, stacks each
  // word above its meaning.
  return (
    <div className="@container flex flex-col gap-3">
      {family.length > 0 && (
        <ul className="flex flex-col">
          {rows.map((w) => (
            <li key={w.text} className="border-t border-black/[0.06] first:border-0">
              <WordLink word={w} className="flex flex-col items-start gap-0.5 py-2 hover:bg-black/[0.02] @xs:flex-row @xs:items-center @xs:gap-3">
                <span className="text-lg @xs:min-w-[7.25rem] @xs:shrink-0"><MorphText word={w} /></span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={`text-sm ${w.gloss ? '' : 'text-black/60'}`}>{w.gloss ?? 'Chưa có nghĩa'}</span>
                  <PosTag full value={w.pos} className="text-xs text-black/60" />
                </span>
                <LevelChip level={w.level} />
              </WordLink>
            </li>
          ))}
        </ul>
      )}
      {family.length > shown && (
        <MoreButton expanded={expanded} label={`Xem thêm ${family.length - shown} từ`} onClick={() => setExpanded((v) => !v)} />
      )}
      {related.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-black/60">Cùng gốc</span>
          <ChipRow words={related} />
        </div>
      )}
    </div>
  )
}

/** Example sentences with the headword in bold and the translation under each. `rows`
 *  divides them with rules, `quote` sets each against a grey bar. */
export function ExampleRows({ examples, lang, resolved, glosses, mark, shown = 3, variant = 'rows' }: {
  /** Already filtered; see cleanExamples. */
  examples: DictExample[]
  lang: LangCode
  resolved: ResolvedText[]
  glosses: (string | null)[]
  mark: string[]
  shown?: number
  variant?: 'rows' | 'quote'
}) {
  const [expanded, setExpanded] = useState(false)
  const byText = new Map(resolved.map((r) => [r.text, r]))
  const visible = expanded ? examples : examples.slice(0, shown)
  return (
    <div className="flex flex-col gap-3">
      <ul className={variant === 'rows' ? 'flex flex-col' : 'flex flex-col gap-3'}>
        {visible.map((e, i) => (
          <li
            key={i}
            className={variant === 'rows'
              ? 'flex flex-col gap-0.5 border-t border-black/[0.06] py-3 first:border-0 first:pt-0 last:pb-0'
              : 'flex flex-col gap-0.5 border-l-2 border-black/10 pl-3'}
          >
            <span className={`flex items-start gap-2 text-[15px] ${variant === 'rows' ? 'justify-between' : ''}`}>
              <span><TappableText text={e.text} lang={lang} resolved={byText.get(e.text)} quiet mark={mark} /></span>
              <span className="-my-1.5"><AudioButton text={e.text} lang={lang} /></span>
            </span>
            {isSentenceTranslation(e.translationVi, glosses) && <span className="text-[13px] text-black/55">{e.translationVi}</span>}
          </li>
        ))}
      </ul>
      {examples.length > shown && (
        <MoreButton expanded={expanded} label={`Xem thêm ${examples.length - shown} ví dụ`} onClick={() => setExpanded((v) => !v)} />
      )}
    </div>
  )
}

export function GrammarList({ points }: { points: GrammarPoint[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {points.map((p) => (
        <li key={p.id}>
          <Link
            href={grammarPointPath(p.id)}
            className="flex items-baseline gap-2 rounded-lg border border-black/10 px-3 py-2.5 text-sm hover:bg-black/[0.03]"
          >
            <span className="shrink-0 text-xs font-semibold text-black/45">{p.level}</span>
            {p.titleVi}
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** Under the dictionary's own material, never in place of it: what the assistant says is
 *  generated, what is above it is sourced. Hidden while AiCoach renders nothing, which it
 *  does where the assistant is off. */
export function AiCorner({ lang, headword, meaningVi, className = `${CARD} p-5 sm:p-6` }: {
  lang: LangCode
  headword: string
  meaningVi: string | null
  className?: string
}) {
  const anchor = useAnchor()
  return (
    <section id={anchor('assistant')} className={`flex flex-col gap-2 [&:has(>div:empty)]:hidden ${className}`}>
      <SectionLabel>Trợ lý</SectionLabel>
      <div>
        <AiCoach lang={lang} headword={headword} meaningVi={meaningVi} />
      </div>
    </section>
  )
}
