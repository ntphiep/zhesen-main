'use client'
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { TappableText } from '@/components/reader/TappableText'
import { passageBlocks, rangesIn, resolveFromWords, unpackWords, type PackedWord, type Range } from '@/lib/practice/toeic/passage'
import { TOEIC_TAGS } from '@/lib/practice/toeic/session'
import type { ToeicGroup } from '@/lib/practice/toeic/tests'
import type { DictEntryPreview } from '@/lib/dictionary/types'
import t from './Toeic.module.css'

const Words = createContext<ReadonlyMap<string, DictEntryPreview>>(new Map())

/** The dictionary entries of every word in a test, resolved once on the server. */
export function WordsProvider({ words, children }: { words: readonly PackedWord[]; children: ReactNode }) {
  const map = useMemo(() => unpackWords(words), [words])
  return <Words.Provider value={map}>{children}</Words.Provider>
}

export function useWords(): ReadonlyMap<string, DictEntryPreview> {
  return useContext(Words)
}

/** English test text with every known word tappable on first paint, in ink rather than blue:
 *  a passage is read first and tapped second. The bold of `marks` stays blue. */
export function Tap({ text, marks }: { text: string; marks?: Range[] }) {
  const words = useWords()
  const resolved = useMemo(() => resolveFromWords(words, text), [words, text])
  return <TappableText text={text} lang="en" resolved={resolved} marks={marks} quiet tags={TOEIC_TAGS} />
}

/** A place in one passage of a group. */
export interface Spot { passage: number; range: Range }

/** The group's passages, with `evidence` in bold on a ruled block and `gap` in bold. */
export function Passages({ group, evidence, gap }: { group: ToeicGroup; evidence?: Spot | null; gap?: Spot | null }) {
  return (
    <>
      {group.intro && <p className={t.intro} lang="en">{group.intro}</p>}
      {group.passages.map((p, i) => {
        const ev: Range[] = evidence?.passage === i ? [evidence.range] : []
        const marks: Range[] = [...ev, ...(gap?.passage === i ? [gap.range] : [])]
        return (
          <article key={i} className={t.passage} lang="en">
            {passageBlocks(p.text).map((b, j) => {
              if (b.kind === 'text') {
                return (
                  <p key={j} className={t.para} data-ev={rangesIn(b.piece, ev).length > 0 || undefined}>
                    <Tap text={b.piece.text} marks={rangesIn(b.piece, marks)} />
                  </p>
                )
              }
              if (b.kind === 'chat') {
                return (
                  <ul key={j} className={t.chat}>
                    {b.lines.map((l, k) => (
                      <li key={k} data-ev={rangesIn(l.msg, ev).length > 0 || undefined}>
                        <small>{l.who}</small>
                        <Tap text={l.msg.text} marks={rangesIn(l.msg, marks)} />
                      </li>
                    ))}
                  </ul>
                )
              }
              const [head, ...rows] = b.rows
              return (
                <div key={j} className={t.sheet}>
                  <table>
                    <thead>
                      <tr>{head.map((c, k) => <th key={k} scope="col">{c.text}</th>)}</tr>
                    </thead>
                    <tbody>
                      {rows.map((cells, k) => (
                        <tr key={k} data-ev={cells.some((c) => rangesIn(c, ev).length > 0) || undefined}>
                          {cells.map((c, m) => (
                            <td key={m} data-label={head[m]?.text} data-empty={c.text.trim() === '' || undefined}>
                              <Tap text={c.text} marks={rangesIn(c, marks)} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </article>
        )
      })}
    </>
  )
}
