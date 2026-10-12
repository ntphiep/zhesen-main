'use client'
import { useEffect, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { theoryBlockPath } from '@/lib/theory/path'
import { theoryReads, type TheoryReads } from '@/lib/theory/reads'
import type { TheoryPage } from '@/lib/theory/pages'
import type { TheoryBlock, TheoryBlockKey } from '@/lib/theory/blocks'
import type { LangCode } from '@/lib/languages'
import { ArrowRight } from './Glyphs'
import s from './Theory.module.css'

const useReads = (): TheoryReads => useSyncExternalStore(theoryReads.subscribe, theoryReads.snapshot, theoryReads.serverSnapshot)

/** Marks each theory page opened. Rendered once by app/theory/layout.tsx, which stays
 *  mounted across the section, so only the pathname changes. */
export function TheoryVisit() {
  const path = usePathname()
  useEffect(() => { theoryReads.record(path, Date.now()) }, [path])
  return null
}

/** "thi hien tai" finds "thì hiện tại". */
const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()

/** `/theory/[lang]` below its head: the next unread page and a search over every page's
 *  title, then the blocks, each with how much of it this browser has read. */
export function TheoryPath({ lang, blocks, counts, pages }: {
  lang: LangCode
  blocks: TheoryBlock[]
  counts: Partial<Record<TheoryBlockKey, string>>
  pages: TheoryPage[]
}) {
  const reads = useReads()
  const [query, setQuery] = useState('')
  const title = new Map(blocks.map((b) => [b.key, b.titleVi]))
  const next = pages.some((p) => reads.has(p.path)) ? pages.find((p) => !reads.has(p.path)) : undefined
  const q = fold(query.trim())
  const found = q ? pages.filter((p) => fold(p.title).includes(q)) : null

  return (
    <>
      <div className={s.pathBar}>
        {next && (
          <Link href={next.path} className={s.resume}>
            <span>
              <span className={s.label}>Đọc tiếp</span>
              <b>{next.title}</b>
              {next.title !== title.get(next.block) && <small>{title.get(next.block)}</small>}
            </span>
            <ArrowRight />
          </Link>
        )}
        <input
          type="search"
          className={s.find}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm trang lý thuyết"
          aria-label="Tìm trang lý thuyết"
          enterKeyHint="search"
        />
      </div>

      {found ? (
        found.length ? (
          <ul className={s.found} aria-live="polite">
            {found.slice(0, 30).map((p) => (
              <li key={p.path}>
                <Link href={p.path}>
                  <span>{p.title}</span>
                  <small>{title.get(p.block)}{reads.has(p.path) && ' · Đã đọc'}</small>
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className={s.note} aria-live="polite">Không tìm thấy trang.</p>
      ) : (
        <ol className={s.blocks}>
          {blocks.map((b, i) => {
            const own = pages.filter((p) => p.block === b.key)
            const done = own.filter((p) => reads.has(p.path)).length
            const all = done > 0 && done === own.length
            return (
              <li key={b.key} data-reveal={Math.min(i, 3)}>
                <Link href={theoryBlockPath(lang, b.key)} className={s.card} data-done={all || undefined}>
                  <span className={s.step} aria-hidden="true">{i + 1}</span>
                  <span className={s.h3}>{b.titleVi}</span>
                  {(counts[b.key] || done > 0) && (
                    <span className={s.note}>
                      {counts[b.key]}
                      {counts[b.key] && done > 0 && ' · '}
                      {done > 0 && <span className={s.readNote}>{own.length === 1 ? 'Đã đọc' : all ? 'Đã đọc hết' : `Đã đọc ${done}/${own.length}`}</span>}
                    </span>
                  )}
                  <span className={s.small}>{b.blurbVi}</span>
                  {done > 0 && <span className={s.meter} aria-hidden="true"><i style={{ transform: `scaleX(${done / own.length})` }} /></span>}
                </Link>
              </li>
            )
          })}
        </ol>
      )}
    </>
  )
}

/** A language tile's share of blocks opened, after hydration. */
export function LangReadMark({ lang, blocks }: { lang: LangCode; blocks: readonly TheoryBlockKey[] }) {
  const reads = useReads()
  const paths = [...reads.keys()]
  const opened = blocks.filter((b) => {
    const root = theoryBlockPath(lang, b)
    return paths.some((p) => p === root || p.startsWith(`${root}/`))
  }).length
  if (!opened) return null
  return (
    <>
      <span className={s.langRead}>Đã mở {opened}/{blocks.length} phần</span>
      <span className={s.meter} aria-hidden="true"><i style={{ transform: `scaleX(${opened / blocks.length})` }} /></span>
    </>
  )
}
