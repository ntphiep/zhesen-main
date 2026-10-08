'use client'
import { useState } from 'react'
import { MoreButton } from './WordParts'
import type { SentencePattern } from '@/lib/dictionary/types'

/** Patterns a list shows before expanding; patterns.py keeps at most 12 per entry. */
const SHOWN = 6

/** accuse sb of sth, with sb and sth set apart as the slots they are. */
export function PatternText({ text }: { text: string }) {
  return (
    <>
      {text.split(/\b(sb's|sb|sth)\b/).map((part, i) => (i % 2 === 1
        ? <i key={i} className="font-normal text-(--zs-soft)">{part}</i>
        : part))}
    </>
  )
}

/** The word's sentence patterns: "accuse sb of sth", its Vietnamese, then an example and its
 *  translation. A wide card sets the English left and the Vietnamese right; a narrow one stacks. */
export function PatternList({ patterns, shown = SHOWN }: { patterns: SentencePattern[]; shown?: number }) {
  const [expanded, setExpanded] = useState(false)
  const rows = expanded ? patterns : patterns.slice(0, shown)
  return (
    <div className="@container flex flex-col gap-3">
      <ul className="flex flex-col">
        {rows.map((p, i) => (
          <li
            key={p.pattern}
            data-more={i >= shown || undefined}
            className="grid gap-x-4 gap-y-0.5 border-t border-(--zs-line) py-2.5 first:border-0 first:pt-0 @md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"
          >
            <span lang="en" className="break-words font-semibold text-(--zs-pen)"><PatternText text={p.pattern} /></span>
            <span className="text-[14.5px]">{p.vi}</span>
            {p.example && <span data-ex="sm" lang="en" className="mt-1 @md:col-start-1">{p.example}</span>}
            {p.exampleVi && <span data-ex-vi="plain" className="@md:col-start-2 @md:mt-1">{p.exampleVi}</span>}
          </li>
        ))}
      </ul>
      {patterns.length > shown && (
        <MoreButton expanded={expanded} label={`Xem thêm ${patterns.length - shown} cấu trúc`} onClick={() => setExpanded((v) => !v)} />
      )}
    </div>
  )
}
