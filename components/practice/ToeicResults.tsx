'use client'
import { useState } from 'react'
import Link from 'next/link'
import { estimateReading, summarize, type Tally } from '@/lib/practice/toeic/score'
import { TOEIC_PATH } from '@/lib/practice/toeic/session'
import type { ToeicGroup, ToeicQuestion as Question } from '@/lib/practice/toeic/tests'
import { ToeicQuestion } from './ToeicQuestion'
import p from './Practice.module.css'
import t from './Toeic.module.css'

export interface Answered { group: ToeicGroup; q: Question; chosen: number | undefined }

function Bars({ rows }: { rows: (Tally & { key: string; label: string })[] }) {
  return (
    <ul className={t.bars}>
      {rows.map((r) => (
        <li key={r.key}>
          <span>{r.label}</span>
          <span className={t.meter} aria-hidden="true"><i style={{ transform: `scaleX(${r.correct / r.total})` }} /></span>
          <span>{r.correct}/{r.total}</span>
        </li>
      ))}
    </ul>
  )
}

/** The end of a session: the score, a score range after a full timed test, accuracy per
 *  part and per question type with the weakest first, and every item to review. */
export function ToeicResults({ items, timed, onRetryWrong, onRestart }: {
  items: readonly Answered[]
  timed: boolean
  onRetryWrong: () => void
  onRestart: () => void
}) {
  const sum = summarize(items.map((i) => ({ part: i.group.part, type: i.q.type, correct: i.chosen === i.q.answer })))
  const wrong = items.filter((i) => i.chosen !== i.q.answer)
  const [only, setOnly] = useState(wrong.length > 0)
  const est = timed ? estimateReading(sum.total.correct) : null
  const shown = only ? wrong : items

  return (
    <div className={t.result}>
      <div className={`${p.card} ${p.end}`}>
        <h1>Kết quả</h1>
        <div className={t.big}>{sum.total.correct}/{sum.total.total}</div>
        <div className={p.meter} aria-hidden="true"><i style={{ transform: `scaleX(${sum.total.correct / sum.total.total})` }} /></div>
        {est && (
          <div className={t.est}>
            <b>Reading ước tính {est.low} đến {est.high}</b>
            <small>Điểm do Zhesen ước lượng, không theo thang điểm chính thức.</small>
          </div>
        )}
        <div className={p.row}>
          {wrong.length > 0 && <button type="button" className={p.btn} onClick={onRetryWrong}>Làm lại câu sai</button>}
          <button type="button" className={p.ghost} onClick={onRestart}>Làm bài khác</button>
          <Link href={TOEIC_PATH} className={p.ghost}>Luyện đề TOEIC</Link>
        </div>
      </div>

      {sum.parts.length > 1 && (
        <section className={t.section}>
          <h2>Theo Part</h2>
          <Bars rows={sum.parts.map((r) => ({ ...r, key: String(r.part), label: `Part ${r.part}` }))} />
        </section>
      )}

      <section className={t.section}>
        <h2>Theo dạng câu</h2>
        <Bars rows={sum.types.map((r) => ({ ...r, key: r.type }))} />
      </section>

      <section className={t.section}>
        <h2>Xem lại</h2>
        {wrong.length > 0 && (
          <div className={t.filter} role="group" aria-label="Câu hiện ra">
            <button type="button" aria-pressed={only} onClick={() => setOnly(true)}>Câu sai ({wrong.length})</button>
            <button type="button" aria-pressed={!only} onClick={() => setOnly(false)}>Tất cả ({items.length})</button>
          </div>
        )}
        <ul className={t.review}>
          {shown.map((i) => (
            <li key={i.q.number}>
              <ToeicQuestion group={i.group} q={i.q} mode="review" chosen={i.chosen} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
