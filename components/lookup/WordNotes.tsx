'use client'
import { useState } from 'react'
import { MoreButton, WordLink } from './WordParts'
import { entryPath } from '@/lib/dictionary/entryId'
import { REL_VI, kindLine, langLabel, originPosLabel, shownOrigins } from '@/lib/dictionary/origin'
import { pickAccentRows } from '@/lib/dictionary/pronunciation'
import { pronunciationTips, stressedSyllables, syllabify } from '@/lib/dictionary/soundNotes'
import type { DictEntryDetail, EntryNotes, Origin, OriginPart } from '@/lib/dictionary/types'

/** What the word page draws from `lex.entry_notes`: how to say the word, where it comes
 *  from, and the grammar labels of a sense. */

const wordHref = (text: string) => entryPath(`en:${text}`)

/** Grammar labels beside a sense: đếm được, ngoại động từ, đi với to. */
export function GrammarChips({ labels }: { labels: string[] }) {
  if (labels.length === 0) return null
  return (
    <>
      {labels.map((l) => (
        <span key={l} className="shrink-0 rounded-full border border-(--zs-line) px-[7px] py-px text-[11px] text-(--zs-soft)">{l}</span>
      ))}
    </>
  )
}

/** The pronunciations a learner reads, the UK row first, as the hero lists them. */
function accentIpas(head: Pick<DictEntryDetail, 'pronunciations' | 'lang' | 'headword'>): string[] {
  return pickAccentRows(head.pronunciations, head.lang, head.headword).map((r) => r.ipa).filter((ipa): ipa is string => Boolean(ipa))
}

/** The syllable count and stress the block states: those of an accent that agrees with the
 *  written syllables, or, without them, those every accent agrees on. idea is /aɪˈdɪə/ in the
 *  UK and /aɪˈdiə/ in the US, so it states none. */
function agreedSyllables(ipas: string[], written: string[] | null): Pick<SoundFacts, 'syllables' | 'count' | 'stress'> {
  const none = { syllables: null, count: 0, stress: -1 }
  if (written && written.length >= 2) {
    const fit = ipas.map((ipa) => stressedSyllables(ipa, written)).find((s) => s !== null)
    return fit ? { syllables: fit, count: written.length, stress: fit.stress } : none
  }
  const counted = ipas.map(syllabify)
  const [first] = counted
  return first && counted.every((c) => c.count === first.count && c.stress === first.stress) ? { syllables: null, ...first } : none
}

export interface SoundFacts {
  syllables: { parts: string[]; stress: number } | null
  count: number
  stress: number
  tips: string[]
  homophones: string[]
}

/** Everything the "Cách đọc" block shows, or null when it would show nothing. English only. */
export function soundFacts(head: Pick<DictEntryDetail, 'pronunciations' | 'lang' | 'headword'>, notes: EntryNotes | null): SoundFacts | null {
  if (head.lang !== 'en') return null
  const ipas = accentIpas(head)
  const facts = {
    ...agreedSyllables(ipas, notes?.syllables ?? null),
    tips: pronunciationTips(ipas[0] ?? null, head.headword),
    homophones: notes?.homophones ?? [],
  }
  const stressed = facts.count >= 2 && facts.stress >= 0
  return stressed || facts.tips.length > 0 || facts.homophones.length > 0 ? facts : null
}

/** dis·cre·tion with the stressed syllable set apart, then the tips and the words that
 *  sound the same. */
export function SoundNotes({ facts }: { facts: SoundFacts }) {
  const { syllables, count, stress, tips, homophones } = facts
  return (
    <div className="flex flex-col gap-3">
      {count >= 2 && stress >= 0 && (
        <div className="flex flex-col gap-1">
          {syllables && (
            <p lang="en" className="text-[22px] leading-tight tracking-[0.01em]">
              {syllables.parts.map((p, i) => (
                <span key={i}>
                  {i > 0 && <span aria-hidden="true" className="px-1 text-(--zs-soft)">·</span>}
                  {i === syllables.stress
                    ? <b className="font-bold text-(--zs-pen) underline decoration-2 underline-offset-4">{p}</b>
                    : <span className="text-(--zs-soft)">{p}</span>}
                </span>
              ))}
            </p>
          )}
          <span className="text-[13px] text-(--zs-soft)">{count} âm tiết, trọng âm rơi vào âm tiết thứ {stress + 1}</span>
        </div>
      )}
      {tips.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-sm leading-snug">
          {tips.map((t) => (
            <li key={t} className="flex gap-2">
              <span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 rounded-full bg-(--zs-pen)" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      )}
      {homophones.length > 0 && (
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
          <span className="text-xs text-(--zs-soft)">Đọc giống</span>
          {homophones.map((h) => (
            <WordLink key={h} word={{ text: h, href: wordHref(h) }} className="mention font-semibold text-(--zs-pen) hover:underline" />
          ))}
        </p>
      )}
    </div>
  )
}

/** Ancestors shown before the rest fold away: cat has six, set more. */
const SHOWN_STEPS = 3

function PartsLine({ parts }: { parts: OriginPart[] }) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-[17px]">
      {parts.map((p, i) => (
        <span key={`${p.word}-${i}`} className="inline-flex items-baseline gap-1.5">
          {i > 0 && <span aria-hidden="true" className="text-(--zs-soft)">+</span>}
          {p.e
            ? <WordLink word={{ text: p.word, href: wordHref(p.word) }} className="mention font-semibold text-(--zs-pen) hover:underline" />
            : <span className="font-semibold">{p.word}</span>}
          {p.gloss && <span className="text-[13px] text-(--zs-soft)">“{p.gloss}”</span>}
        </span>
      ))}
    </p>
  )
}

function OriginBlock({ origin, labelled }: { origin: Origin; labelled: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const steps = expanded ? origin.chain : origin.chain.slice(0, SHOWN_STEPS)
  const hidden = origin.chain.length - SHOWN_STEPS
  const pos = labelled ? originPosLabel(origin) : ''
  const kind = origin.kind ? kindLine(origin.kind) : null
  return (
    <div className="flex flex-col gap-2.5">
      {pos && <span className="text-xs font-semibold text-(--zs-soft)">{pos}</span>}
      {kind && (
        <p className="text-sm">
          {kind.text}
          {kind.word && ' '}
          {kind.word && (kind.linked
            ? <WordLink word={{ text: kind.word, href: wordHref(kind.word) }} className="mention font-semibold text-(--zs-pen) hover:underline" />
            : <span className="font-semibold">{kind.word}</span>)}
        </p>
      )}
      {origin.parts && <PartsLine parts={origin.parts} />}
      {steps.length > 0 && (
        <ol className="flex flex-col gap-2 border-l-2 border-(--zs-line) pl-3.5">
          {steps.map((s) => (
            <li key={`${s.lang}-${s.word}`} className="flex flex-col">
              <span className="text-xs text-(--zs-soft)">{REL_VI[s.rel]} {langLabel(s)}</span>
              <span className="flex flex-wrap items-baseline gap-x-1.5">
                <i lang={/^[a-z]{2,3}$/.test(s.lang) ? s.lang : undefined} className="font-semibold">{s.word}</i>
                {s.tr && <span className="text-[13px] text-(--zs-soft)">{s.tr}</span>}
                {s.gloss && <span className="text-[13px] text-(--zs-soft)">“{s.gloss}”</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
      {hidden > 0 && <MoreButton expanded={expanded} label={`Xem thêm ${hidden} đời trước`} onClick={() => setExpanded((v) => !v)} />}
      {origin.doublets && (
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
          <span className="text-xs text-(--zs-soft)">Cùng gốc</span>
          {origin.doublets.map((d) => (
            <WordLink key={d} word={{ text: d, href: wordHref(d) }} className="mention font-semibold text-(--zs-pen) hover:underline" />
          ))}
        </p>
      )}
    </div>
  )
}

/** The word's etymologies, the one of its leading part of speech first. Each names how the
 *  word was made, its parts, and its ancestors nearest first. */
export function OriginNotes({ notes, leadPos }: { notes: EntryNotes | null; leadPos: string | null | undefined }) {
  const origins = shownOrigins(notes, leadPos)
  if (origins.length === 0) return null
  return (
    <div className="flex flex-col gap-4">
      {origins.map((o, i) => (
        <div key={i} className="flex flex-col border-t border-(--zs-line) pt-4 first:border-0 first:pt-0">
          <OriginBlock origin={o} labelled={origins.length > 1} />
        </div>
      ))}
    </div>
  )
}

/** Rows a layout's balancing counts for the origin block. */
export function originRows(notes: EntryNotes | null, leadPos: string | null | undefined): number {
  return shownOrigins(notes, leadPos).reduce((n, o) => n + 1 + (o.parts ? 1 : 0) + 1.5 * Math.min(o.chain.length, SHOWN_STEPS), 1)
}
