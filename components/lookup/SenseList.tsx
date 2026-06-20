'use client'
import { useState } from 'react'
import { pickSenses } from '@/lib/dictionary/search'
import type { DictSense } from '@/lib/dictionary/types'

export function SenseList({ senses }: { senses: DictSense[] }) {
  const [expanded, setExpanded] = useState(false)
  if (senses.length === 0) return null

  const { hiddenCount } = pickSenses(senses, 3)
  const visible = expanded ? [...senses].sort((a, b) => a.senseOrder - b.senseOrder) : pickSenses(senses, 3).shown

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
                {s.glossVi && <span className="text-black/80">{s.glossVi}</span>}
                {s.glossEn && <span className="ml-2 text-sm text-black/50">{s.glossEn}</span>}
                {!s.glossVi && !s.glossEn && <span className="italic text-black/30">(chưa có nghĩa)</span>}
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
          {expanded ? 'Thu gọn' : `Xem tất cả ${senses.length} nghĩa`}
        </button>
      )}
    </section>
  )
}
