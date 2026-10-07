'use client'
import { useId } from 'react'
import dynamic from 'next/dynamic'
import { CHECK, CROSS } from '@/components/practice/SessionParts'
import { useAiEnabled } from '@/lib/hooks/useAiEnabled'
import { askAi } from '@/lib/ai/ask'
import { evidenceAt, linesAround, rangesIn } from '@/lib/practice/toeic/passage'
import { askSeed, LETTERS, TOEIC_TAGS } from '@/lib/practice/toeic/session'
import { TYPE_LABELS } from '@/lib/practice/toeic/score'
import type { ToeicGroup, ToeicQuestion as Question } from '@/lib/practice/toeic/tests'
import { Tap, useWords } from './ToeicText'
import p from './Practice.module.css'
import t from './Toeic.module.css'

// As in WordPopover: it reaches supabase-js and zod, which only a save needs.
const AddToWordlistButton = dynamic(() =>
  import('@/components/lookup/AddToWordlistButton').then((m) => m.AddToWordlistButton),
)

/**
 * One item. `exam` takes and changes an answer with no verdict. `practice` locks on the
 * first pick and explains it. `review` shows the verdict for a pick that may be missing,
 * with the passage line that proves the key and, for a missed one-word key, its save.
 * Options are plain text until graded: a word looked up before choosing gives the answer
 * away, and a tap on the only word of a Part 5 option would open it instead of choosing.
 */
export function ToeicQuestion({ group, q, mode, chosen, current, flagged, onChoose, onFlag }: {
  group: ToeicGroup
  q: Question
  mode: 'exam' | 'practice' | 'review'
  chosen: number | undefined
  current?: boolean
  flagged?: boolean
  onChoose?: (option: number) => void
  onFlag?: () => void
}) {
  const id = useId()
  const graded = mode === 'review' || (mode === 'practice' && chosen !== undefined)
  return (
    <section id={`q-${q.number}`} className={t.q} data-current={current || undefined} aria-labelledby={`${id}-n`}>
      <fieldset>
        <legend className="sr-only">Câu {q.number}</legend>
        <div className={t.qHead}>
          <b id={`${id}-n`}>Câu {q.number}</b>
          {mode === 'review' && <span>Part {group.part} · {TYPE_LABELS[q.type]}</span>}
          {mode === 'exam' && (
            <button type="button" className={t.flag} aria-pressed={Boolean(flagged)} onClick={onFlag}>
              {flagged ? 'Đã đánh dấu' : 'Đánh dấu'}
            </button>
          )}
        </div>
        {q.stem
          ? <p className={t.stem} lang="en"><Tap text={q.stem} /></p>
          : <p className={t.stem} data-gap="">Chỗ trống ({q.number})</p>}
        <div className={`${p.opts} ${t.opts}`}>
          {q.options.map((opt, i) => {
            const state = graded
              ? i === q.answer ? 'ok' : i === chosen ? 'no' : 'rest'
              : i === chosen ? 'sel' : undefined
            return (
              <label key={i} className={`${p.opt} ${t.opt}`} data-state={state}>
                <input
                  type="radio"
                  name={`${id}-opt`}
                  checked={chosen === i}
                  disabled={graded}
                  onChange={() => onChoose?.(i)}
                />
                <b>({LETTERS[i]})</b>
                <span lang="en">{graded ? <Tap text={opt} /> : opt}</span>
                <span className={p.mk}>{state === 'ok' ? CHECK : state === 'no' ? CROSS : null}</span>
              </label>
            )
          })}
        </div>
      </fieldset>
      {/* Mounted empty before the pick, or a screen reader never announces the verdict. */}
      {mode === 'practice' && <p role="status" className="sr-only">{graded ? `Câu ${q.number}: ${verdict(q, chosen)}` : ''}</p>}
      {graded && <Explain group={group} q={q} chosen={chosen} quote={mode === 'review'} />}
    </section>
  )
}

const verdict = (q: Question, chosen: number | undefined) =>
  chosen === q.answer ? 'Đúng.' : `${chosen === undefined ? 'Chưa chọn' : 'Sai'}. Đáp án (${LETTERS[q.answer]}).`

function Explain({ group, q, chosen, quote }: { group: ToeicGroup; q: Question; chosen: number | undefined; quote: boolean }) {
  const ai = useAiEnabled()
  const words = useWords()
  const right = chosen === q.answer
  const key = q.options[q.answer]
  const spot = quote ? evidenceAt(group, q) : null
  const line = spot && linesAround(group.passages[spot.passage].text, spot.range)
  // A one-word key the learner missed, saved with the sentence it completes.
  const entry = quote && !right && !/\s/.test(key) ? words.get(key.toLowerCase()) : undefined
  const filled = (q.stem || q.evidence).replace(/\(\d+\) -{7}|-{7}/, key)
  const sentence = filled.toLowerCase().includes(key.toLowerCase()) ? filled : null
  return (
    <div className={t.explain}>
      <p className={t.verdict} data-v={right ? 'correct' : 'wrong'} aria-hidden={!quote || undefined}>
        {right ? CHECK : CROSS}
        <span>{verdict(q, chosen)}</span>
      </p>
      <p>{q.explanationVi}</p>
      {q.vi && <p className={t.vi}>{q.vi}</p>}
      {line && spot && (
        <p className={t.quote} lang="en">
          <Tap text={line.text} marks={rangesIn(line, [spot.range])} />
        </p>
      )}
      {(ai || entry) && (
        <div className={t.tools}>
          {entry && (
            <span className={t.keyword}>
              <span data-hw="" lang="en">{entry.headword}</span>
              {entry.glossVi && <span>{entry.glossVi}</span>}
              <AddToWordlistButton
                entry={entry}
                context={sentence ? { text: sentence, translationVi: q.vi ?? null } : null}
                tags={TOEIC_TAGS}
              />
            </span>
          )}
          {ai && (
            <button
              type="button"
              className={t.ask}
              onClick={() => askAi({ label: `câu ${q.number}`, seed: askSeed(group, q, chosen), draft: 'Giải thích thêm câu này.' })}
            >
              Hỏi AI về câu này
            </button>
          )}
        </div>
      )}
    </div>
  )
}
