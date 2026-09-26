'use client'
import { createContext, useContext, useState } from 'react'
import Link from 'next/link'
import { LinkPending } from '@/components/ui/LinkPending'
import { PosTag } from '@/components/ui/PosTag'
import { AiCoach } from '@/components/ai/AiCoach'
import { searchPath } from '@/lib/dictionary/entryId'
import { splitPhrasalVerbs, type FamilyWord, type ViewForm, type ViewWord, type WordView } from '@/lib/dictionary/wordView'
import type { LangCode } from '@/lib/languages'

/**
 * Pieces the three word-page layouts share: the card, the word link that the
 * side-by-side layout turns into "open in a column", and the blocks for forms,
 * synonyms, phrases and the word family.
 */

/** Set by the side-by-side layout: opens an entry in a column instead of navigating. */
export const OpenWordContext = createContext<((id: string, text: string) => void) | null>(null)

export function WordLink({ word, className = '', children }: {
  word: Pick<ViewWord, 'text' | 'href' | 'id'> & { gloss?: string | null }
  className?: string
  children?: React.ReactNode
}) {
  const open = useContext(OpenWordContext)
  const id = word.id
  function onClick(ev: React.MouseEvent<HTMLAnchorElement>) {
    // A modified click keeps the browser's own meaning: a new tab, a new window.
    if (!open || !id || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button !== 0) return
    ev.preventDefault()
    open(id, word.text)
  }
  return (
    <Link href={word.href} onClick={onClick} className={className} title={children ? undefined : word.gloss ?? undefined}>
      {children ?? word.text}
      {!open && <LinkPending />}
    </Link>
  )
}

export function Tile({ title, id, action, className = '', children }: {
  title?: string
  id?: string
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className={`flex min-w-0 flex-col gap-3 rounded-xl border border-black/10 p-4 ${className}`}>
      {(title || action) && (
        <div className="flex items-baseline justify-between gap-3">
          {title && <h2 className="text-xs font-semibold uppercase tracking-wide text-black/55">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function LevelChip({ level, strong = false }: { level: string | null; strong?: boolean }) {
  if (!level) return null
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${strong ? 'bg-black text-white' : 'bg-black/5 text-black/60'}`}>
      {level}
    </span>
  )
}

/** mis|take: the part outside the stem in violet, the stem in ink. */
export function MorphText({ word }: { word: Pick<FamilyWord, 'before' | 'stem' | 'after'> }) {
  return (
    <>
      {word.before && <span className="text-violet-700">{word.before}</span>}
      <span>{word.stem}</span>
      {word.after && <span className="text-violet-700">{word.after}</span>}
    </>
  )
}

/** t|ook: what a form keeps of the headword in ink, what changes in colour, amber when
 *  the change breaks the rules. */
export function FormText({ form }: { form: ViewForm }) {
  return (
    <>
      {form.kept}
      <span className={`font-bold ${form.irregular ? 'text-amber-700' : 'text-emerald-700'}`}>{form.changed}</span>
      {form.irregular && <span className="sr-only"> (bất quy tắc)</span>}
    </>
  )
}

/** Five bars for a word in the 3,000 most common, fewer the further down it ranks. */
export function frequencyBars(rank: number | null | undefined): number {
  if (rank == null || rank > 3000) return 0
  return rank <= 500 ? 5 : rank <= 1000 ? 4 : 3
}

export function WordChip({ word, tone = 'blue' }: { word: ViewWord; tone?: 'blue' | 'rose' }) {
  const colours = tone === 'rose' ? 'bg-rose-50 text-rose-700' : 'bg-blue-50 text-blue-700'
  return (
    <WordLink
      word={word}
      className={`rounded-full px-2.5 py-0.5 text-sm font-medium hover:underline ${colours}`}
    />
  )
}

function MoreButton({ expanded, hidden, onClick }: { expanded: boolean; hidden: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      className="w-fit text-sm font-medium text-blue-700 hover:underline"
    >
      {expanded ? 'Thu gọn' : `Xem thêm ${hidden}`}
    </button>
  )
}

function ChipRow({ words, tone, shown = 10 }: { words: ViewWord[]; tone?: 'blue' | 'rose'; shown?: number }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? words : words.slice(0, shown)
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visible.map((w) => <WordChip key={w.text} word={w} tone={tone} />)}
      {words.length > shown && (
        <MoreButton expanded={expanded} hidden={words.length - shown} onClick={() => setExpanded((v) => !v)} />
      )}
    </div>
  )
}

/** A word list as a table: the word, its part of speech, its meaning and its level. The
 *  first `shown` rows, then a button for the rest. */
export function WordTable({ words, shown = 6, family = false }: {
  words: (ViewWord | FamilyWord)[]
  shown?: number
  family?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  if (words.length === 0) return null
  const rows = expanded ? words : words.slice(0, shown)
  return (
    <div className="flex flex-col gap-1">
      <table className="w-full border-collapse text-sm">
        <tbody>
          {rows.map((w) => (
            <tr key={w.text} className="border-t border-black/5 first:border-t-0">
              <td className="py-1.5 pr-3 align-baseline">
                <WordLink word={w} className={`font-semibold hover:underline ${family ? 'text-black' : 'text-blue-700'}`}>
                  {family && 'stem' in w ? <MorphText word={w} /> : w.text}
                </WordLink>
              </td>
              <td className="whitespace-nowrap py-1.5 pr-3 align-baseline text-xs text-black/45">
                <PosTag value={w.pos} />
              </td>
              <td className="py-1.5 pr-2 align-baseline text-black/75">
                {w.gloss ?? <span className="text-black/30">Chưa có nghĩa</span>}
              </td>
              <td className="w-px py-1.5 text-right align-baseline"><LevelChip level={w.level} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {words.length > shown && (
        <MoreButton expanded={expanded} hidden={words.length - shown} onClick={() => setExpanded((v) => !v)} />
      )}
    </div>
  )
}

/** Dạng từ as a row of columns, the form's name above and the form below. */
export function FormsBlock({ forms, lang }: { forms: ViewForm[]; lang: LangCode }) {
  const irregular = forms.some((f) => f.irregular)
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-wrap gap-x-6 gap-y-3">
        {forms.map((f) => (
          <li key={f.text} className="flex flex-col gap-0.5">
            <span className="text-xs text-black/45">{f.label}</span>
            <Link href={searchPath(lang, f.text)} className="text-lg font-medium hover:underline">
              <FormText form={f} />
            </Link>
          </li>
        ))}
      </ol>
      {lang === 'en' && (
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-black/50">
          <span><span className="font-bold text-emerald-700">xanh</span> thêm đuôi theo quy tắc</span>
          {irregular && <span><span className="font-bold text-amber-700">cam</span> bất quy tắc</span>}
        </p>
      )}
    </div>
  )
}

/** Synonyms under the sense they share a meaning with, then the rest, then antonyms. */
export function SynonymsBlock({ view }: { view: Pick<WordView, 'senseSynonyms' | 'synonyms' | 'antonyms'> }) {
  const rows = [
    ...view.senseSynonyms.map((s) => ({ key: `s${s.senseOrder}`, label: s.label, words: s.words, tone: 'blue' as const })),
    ...(view.synonyms.length > 0
      ? [{ key: 'other', label: view.senseSynonyms.length > 0 ? 'Khác' : 'Đồng nghĩa', words: view.synonyms, tone: 'blue' as const }]
      : []),
    ...(view.antonyms.length > 0 ? [{ key: 'anti', label: 'Trái nghĩa', words: view.antonyms, tone: 'rose' as const }] : []),
  ]
  return (
    <dl className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <div key={r.key} className="grid grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)] items-baseline gap-3">
          <dt className={`truncate text-sm ${r.tone === 'rose' ? 'font-medium text-rose-700' : 'text-black/60'}`} title={r.label}>
            {r.label}
          </dt>
          <dd><ChipRow words={r.words} tone={r.tone} /></dd>
        </div>
      ))}
    </dl>
  )
}

export const hasSynonyms = (v: Pick<WordView, 'senseSynonyms' | 'synonyms' | 'antonyms'>) =>
  v.senseSynonyms.length + v.synonyms.length + v.antonyms.length > 0

/** English phrasal verbs as cards keyed by their particle, every other phrase as a table. */
export function PhrasesBlock({ headword, lang, phrases, shown = 6 }: {
  headword: string
  lang: LangCode
  phrases: ViewWord[]
  shown?: number
}) {
  const [expanded, setExpanded] = useState(false)
  const { phrasal, other } = lang === 'en' ? splitPhrasalVerbs(headword, phrases) : { phrasal: [], other: phrases }
  const cards = expanded ? phrasal : phrasal.slice(0, shown)
  return (
    <div className="flex flex-col gap-3">
      {phrasal.length > 0 && (
        <div className="flex flex-col gap-1">
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {cards.map((w) => (
              <li key={w.text} className="min-w-0">
                <WordLink word={w} className="flex h-full flex-col gap-0.5 rounded-lg bg-black/[0.03] px-3 py-2 hover:bg-black/[0.06]">
                  <span className="font-semibold">
                    <span className="text-black/45">{headword} </span>
                    <span className="text-blue-700">{w.particle}</span>
                  </span>
                  <span className="line-clamp-2 text-sm text-black/60">{w.gloss ?? 'Chưa có nghĩa'}</span>
                </WordLink>
              </li>
            ))}
          </ul>
          {phrasal.length > shown && (
            <MoreButton expanded={expanded} hidden={phrasal.length - shown} onClick={() => setExpanded((v) => !v)} />
          )}
        </div>
      )}
      <WordTable words={other} />
    </div>
  )
}

/** Under the dictionary's own material, never in place of it: what the assistant says is
 *  generated, what is above it is sourced. Hidden while AiCoach renders nothing, which it
 *  does where the assistant is off. */
export function AiCorner({ lang, headword, meaningVi }: { lang: LangCode; headword: string; meaningVi: string | null }) {
  return (
    <section className="flex flex-col gap-2 rounded-xl bg-black/[0.03] p-4 [&:has(>div:empty)]:hidden">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-black/55">Trợ lý</h2>
      <div>
        <AiCoach lang={lang} headword={headword} meaningVi={meaningVi} />
      </div>
    </section>
  )
}

/** Derived words with the part they add coloured, then the words that share the root. */
export function FamilyBlock({ family, related }: { family: FamilyWord[]; related: ViewWord[] }) {
  return (
    <div className="flex flex-col gap-3">
      <WordTable words={family} family />
      {related.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-black/45">Cùng gốc</span>
          <ChipRow words={related} />
        </div>
      )}
    </div>
  )
}
