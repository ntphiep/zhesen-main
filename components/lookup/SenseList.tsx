'use client'
import { useState } from 'react'
import { pickSenses, isClassifierGloss, parseClassifiers } from '@/lib/dictionary/textQuality'
import type { DictSense } from '@/lib/dictionary/types'

export function SenseList({ senses }: { senses: DictSense[] }) {
  const [expanded, setExpanded] = useState(false)

  // Chinese entries carry CC-CEDICT "CL:" rows that are classifier notes, not
  // meanings — surface them as a separate "Lượng từ" line and keep them out of
  // the numbered meaning list.
  const classifiers = [...new Set(senses.flatMap((s) => parseClassifiers(s.glossEn)))]
  const meaningful = senses.filter((s) => !isClassifierGloss(s.glossEn))
  if (meaningful.length === 0 && classifiers.length === 0) return null

  const { hiddenCount } = pickSenses(meaningful, 3)
  const visible = expanded ? [...meaningful].sort((a, b) => a.senseOrder - b.senseOrder) : pickSenses(meaningful, 3).shown

  const groups: { pos: string | null; items: DictSense[] }[] = []
  for (const s of visible) {
    let g = groups.find((x) => x.pos === s.pos)
    if (!g) { g = { pos: s.pos, items: [] }; groups.push(g) }
    g.items.push(s)
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Nghĩa</h2>
      {groups.map((g, gi) => (
        <div key={gi} className="flex flex-col gap-1.5">
          {g.pos && <span className="text-xs font-semibold uppercase tracking-wide text-black/40">{g.pos}</span>}
          <ol className="flex list-inside list-decimal flex-col gap-1">
            {g.items.map((s, i) => (
              <li key={i}>
                {s.glossVi
                  ? <span className="text-black/80">{s.glossVi}</span>
                  : s.pivotVi && (
                    <span className="text-black/80">
                      {s.pivotVi}
                      <span className="ml-1 align-middle text-[10px] uppercase tracking-wide text-amber-700/70" title="Nghĩa suy ra qua tiếng Anh">qua tiếng Anh</span>
                    </span>
                  )}
                {s.glossEn && <span className="ml-2 text-sm text-black/50">{s.glossEn}</span>}
                {!s.glossVi && !s.pivotVi && !s.glossEn && <span className="italic text-black/30">(chưa có nghĩa)</span>}
              </li>
            ))}
          </ol>
        </div>
      ))}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-fit text-sm text-blue-700 hover:underline"
        >
          {expanded ? 'Thu gọn' : `Xem tất cả ${meaningful.length} nghĩa`}
        </button>
      )}
      {classifiers.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-black/40">Lượng từ</span>
          {classifiers.map((c) => (
            <span key={c} className="rounded-full bg-black/5 px-3 py-1 font-medium text-black/80">{c}</span>
          ))}
        </div>
      )}
    </section>
  )
}
