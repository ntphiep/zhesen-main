'use client'
import { useState } from 'react'
import type { Conjugation, ConjPerson, ConjTense, ConjTenseKey } from '@/lib/dictionary/conjugation'

const PERSONS: { key: ConjPerson; label: string }[] = [
  { key: '1s', label: 'yo' },
  { key: '2s', label: 'tú' },
  { key: '3s', label: 'él/ella/Ud.' },
  { key: '1p', label: 'nosotros' },
  { key: '2p', label: 'vosotros' },
  { key: '3p', label: 'ellos/Uds.' },
]

const TENSE_LABELS: Record<ConjTenseKey, string> = {
  present: 'Presente', preterite: 'Pretérito', imperfect: 'Imperfecto',
  conditional: 'Condicional', future: 'Futuro',
  subPresent: 'Presente', subImperfect: 'Imperfecto',
}

function Grid({ tenses }: { tenses: ConjTense[] }) {
  if (tenses.length === 0) return null
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem] border-collapse text-sm">
        <thead>
          <tr>
            <th className="px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-black/55"></th>
            {tenses.map((t) => (
              <th key={t.key} className="px-3 py-1.5 text-left font-semibold text-black/70">{TENSE_LABELS[t.key]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERSONS.map((p) => (
            <tr key={p.key} className="border-t border-black/5">
              <td className="px-2 py-1.5 text-xs text-black/55">{p.label}</td>
              {tenses.map((t) => (
                <td key={t.key} className="px-3 py-1.5 font-medium text-black/80">{t.forms[p.key] ?? '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Chip({ text }: { text: string }) {
  return <span className="rounded-full bg-black/5 px-3 py-1 text-sm font-medium text-black/80">{text}</span>
}

/** Spanish verb conjugation, SpanishDict-style: non-finite forms + present indicative
 * shown by default, the full indicative/subjunctive/imperative paradigm behind a toggle.
 * The layout around it gives the heading. */
export function ConjugationTable({ conjugation: c }: { conjugation: Conjugation }) {
  const [expanded, setExpanded] = useState(false)
  const present = c.indicative.filter((t) => t.key === 'present')

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {c.infinitive && <span><span className="text-black/55">Nguyên thể </span><span className="font-medium">{c.infinitive}</span></span>}
        {c.gerund && <span><span className="text-black/55">Gerundio </span><span className="font-medium">{c.gerund}</span></span>}
        {c.pastParticiple && <span><span className="text-black/55">Phân từ </span><span className="font-medium">{c.pastParticiple}</span></span>}
      </div>

      {!expanded && <Grid tenses={present} />}

      {expanded && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-black/55">Lối trình bày (Indicativo)</span>
            <Grid tenses={c.indicative} />
          </div>
          {c.subjunctive.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-black/55">Lối giả định (Subjuntivo)</span>
              <Grid tenses={c.subjunctive} />
            </div>
          )}
          {(c.imperativeAffirmative.length > 0 || c.imperativeNegative.length > 0) && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-black/55">Mệnh lệnh (Imperativo)</span>
              {c.imperativeAffirmative.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-black/55">Khẳng định</span>
                  {c.imperativeAffirmative.map((f, i) => <Chip key={i} text={f} />)}
                </div>
              )}
              {c.imperativeNegative.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-black/55">Phủ định</span>
                  {c.imperativeNegative.map((f, i) => <Chip key={i} text={f} />)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-fit text-sm text-blue-700 hover:underline"
      >
        {expanded ? 'Thu gọn' : 'Xem bảng chia đầy đủ'}
      </button>
    </div>
  )
}
