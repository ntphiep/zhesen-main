'use client'
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { readStored, useStoredPref, writeStored } from '@/lib/hooks/useStoredPref'
import { evidenceAt, gapAt, type PackedWord } from '@/lib/practice/toeic/passage'
import { estimateReading } from '@/lib/practice/toeic/score'
import {
  clock, EXAM_MS, HISTORY_KEY, parseHistory, parseProgress, PROGRESS_KEY, serializeHistory, serializeProgress,
  TOEIC_PATH, type ToeicProgress,
} from '@/lib/practice/toeic/session'
import type { ToeicGroup, ToeicPart, ToeicQuestion as Question, ToeicTest } from '@/lib/practice/toeic/tests'
import { Passages, WordsProvider } from './ToeicText'
import { ToeicQuestion } from './ToeicQuestion'
import { ToeicResults } from './ToeicResults'
import p from './Practice.module.css'
import t from './Toeic.module.css'

interface Session {
  /** What the hub shows for it: "Thi thử", "Part 5", "Câu sai". */
  label: string
  numbers: readonly number[]
  /** The full test against the clock, the only session with a score range. */
  timed: boolean
}

type View =
  | { at: 'start' }
  | { at: 'exam'; session: Session; deadline: number; current: number }
  | { at: 'practice'; session: Session; step: number }
  | { at: 'results'; session: Session }

const PARTS: readonly ToeicPart[] = [5, 6, 7]

/** Writes or, with null, removes this test's unfinished session. Read fresh from storage, so
 *  another test's entry is never overwritten with a stale copy. */
function keepProgress(id: string, entry: ToeicProgress | null) {
  const rest = Object.entries(parseProgress(readStored(PROGRESS_KEY))).filter(([k]) => k !== id)
  writeStored(PROGRESS_KEY, serializeProgress(Object.fromEntries(entry ? [...rest, [id, entry]] : rest)))
}

/** Below this width the passage stacks above the questions (Toeic.module.css). */
const STACKED = '(max-width: 899px)'

const top = () => { if (typeof window.scrollTo === 'function') window.scrollTo({ top: 0 }) }

/** The groups holding `numbers`, each with only those questions, in test order. */
function groupsOf(test: ToeicTest, numbers: readonly number[]): { group: ToeicGroup; questions: Question[] }[] {
  const wanted = new Set(numbers)
  return test.groups
    .map((group) => ({ group, questions: group.questions.filter((q) => wanted.has(q.number)) }))
    .filter((g) => g.questions.length > 0)
}

/** A test taken in the browser: the start screen, the timed test, practice on one part or on
 *  missed questions, and the results. Nothing leaves the browser: an unfinished session and
 *  the last result stay in localStorage. `part` opens that part's practice. */
export function ToeicRunner({ test, words, part = null }: {
  test: ToeicTest
  words: readonly PackedWord[]
  part?: ToeicPart | null
}) {
  const index = useMemo(
    () => new Map(test.groups.flatMap((group) => group.questions.map((q) => [q.number, { group, q }] as const))),
    [test],
  )
  const [view, setView] = useState<View>(() => (part ? practiceOf(part) : { at: 'start' }))
  const [answers, setAnswers] = useState<ReadonlyMap<number, number>>(new Map())
  const [flags, setFlags] = useState<ReadonlySet<number>>(new Set())
  const [focus, setFocus] = useState<number | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [now, setNow] = useState(0)
  const [history, setHistory] = useStoredPref(HISTORY_KEY, parseHistory, serializeHistory)
  const [progress] = useStoredPref(PROGRESS_KEY, parseProgress, serializeProgress)
  const saved = progress[test.id]
  const nav = useRef<HTMLDetailsElement>(null)
  /** Set by a jump from the navigator on a phone, so the question lands at the top. */
  const jumped = useRef(false)

  function practiceOf(x: ToeicPart): View {
    const numbers = test.groups.filter((g) => g.part === x).flatMap((g) => g.questions.map((q) => q.number))
    return { at: 'practice', session: { label: `Part ${x}`, numbers, timed: false }, step: 0 }
  }

  function begin(next: View, kept?: ToeicProgress) {
    setAnswers(new Map(kept?.answers))
    setFlags(new Set(kept?.flags))
    setFocus(null)
    setView(next)
    top()
  }

  function resume(kept: ToeicProgress) {
    const at = Date.now()
    setNow(at)
    begin(kept.left === null
      ? { at: 'practice', session: kept.session, step: kept.step }
      : { at: 'exam', session: kept.session, deadline: at + kept.left, current: kept.current }, kept)
  }

  function startExam() {
    const at = Date.now()
    setNow(at)
    begin({
      at: 'exam',
      session: { label: 'Thi thử', numbers: [...index.keys()], timed: true },
      deadline: at + EXAM_MS,
      current: test.groups[0].questions[0].number,
    })
  }

  function finish(session: Session) {
    const correct = session.numbers.filter((n) => answers.get(n) === index.get(n)?.q.answer).length
    setHistory({
      ...history,
      [test.id]: {
        at: Date.now(), label: session.label, correct, total: session.numbers.length,
        score: session.timed ? estimateReading(correct) : null,
      },
    })
    keepProgress(test.id, null)
    setConfirming(false)
    setView({ at: 'results', session })
    top()
  }

  // Every change of an unfinished session is kept, so a link out of the page loses nothing.
  // The clock is kept as time left and stops while the learner is away. A practice with no
  // answer yet keeps nothing, so opening a part does not replace a test left halfway.
  const left = view.at === 'exam' ? Math.max(0, view.deadline - now) : null
  useEffect(() => {
    if (view.at !== 'exam' && !(view.at === 'practice' && answers.size > 0)) return
    keepProgress(test.id, {
      session: { ...view.session, numbers: [...view.session.numbers] },
      answers: [...answers],
      flags: [...flags],
      left,
      current: view.at === 'exam' ? view.current : 0,
      step: view.at === 'practice' ? view.step : 0,
    })
  }, [test.id, view, answers, flags, left])

  const deadline = view.at === 'exam' ? view.deadline : null
  const expire = useEffectEvent(() => { if (view.at === 'exam') finish(view.session) })
  useEffect(() => {
    if (deadline === null) return
    const id = window.setInterval(() => {
      const at = Date.now()
      setNow(at)
      if (at >= deadline) expire()
    }, 1000)
    // Closing the tab mid-test loses every answer, so the browser asks first.
    const hold = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', hold)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('beforeunload', hold)
    }
  }, [deadline])

  const current = view.at === 'exam' ? view.current : null
  useEffect(() => {
    if (current === null) return
    document.getElementById(`q-${current}`)?.scrollIntoView?.({ block: jumped.current ? 'start' : 'nearest' })
    jumped.current = false
  }, [current])

  function choose(n: number, option: number) {
    setAnswers((a) => new Map(a).set(n, option))
    setFocus(n)
  }

  let body: React.ReactNode
  if (view.at === 'start') {
    body = (
      <div className={t.start}>
        <Link href={TOEIC_PATH} className={p.back}>← Luyện đề TOEIC</Link>
        <h1 className="mt-3">{test.titleVi} · Reading</h1>
        <p>{index.size} câu trong 75 phút. Hết giờ thì bài tự nộp.</p>
        {saved && (
          <div className={t.last}>
            Đang làm dở, {saved.session.label}{saved.left !== null && `, còn ${clock(saved.left)}`}.
            <button type="button" className={`${p.btn} ${p.wide}`} onClick={() => resume(saved)}>Làm tiếp</button>
          </div>
        )}
        <div className={p.row}>
          <button type="button" className={`${saved ? p.ghost : p.btn} ${p.wide}`} onClick={startExam}>
            {saved ? 'Bắt đầu thi lại' : 'Bắt đầu thi'}
          </button>
        </div>
        <h2>Luyện từng Part</h2>
        <p>Chọn xong thấy ngay đáp án và giải thích.</p>
        <div className={t.actions}>
          {PARTS.map((x) => (
            <button key={x} type="button" className={p.ghost} onClick={() => begin(practiceOf(x))}>Part {x}</button>
          ))}
        </div>
      </div>
    )
  } else if (view.at === 'exam') {
    const { group } = index.get(view.current) ?? { group: test.groups[0] }
    const order = view.session.numbers
    const at = order.indexOf(view.current)
    const go = (n: number) => setView({ ...view, current: n })
    // On a phone the open navigator hides the question, so a jump closes it.
    const jump = (n: number) => {
      if (nav.current && window.matchMedia?.(STACKED).matches) {
        nav.current.open = false
        if (n === view.current) document.getElementById(`q-${n}`)?.scrollIntoView?.({ block: 'start' })
        else jumped.current = true
      }
      go(n)
    }
    const open = order.length - order.filter((n) => answers.has(n)).length
    body = (
      <>
        <div className={t.bar}>
          <Link href={TOEIC_PATH}>← Thoát</Link>
          <span className={t.timer} role="timer" aria-label="Thời gian còn lại" data-low={(left ?? 0) < 5 * 60 * 1000 || undefined}>
            {clock(left ?? 0)}
          </span>
          <span className={t.count}>Đã làm {order.length - open}/{order.length}</span>
          <button type="button" className={p.btn} onClick={() => setConfirming(true)}>Nộp bài</button>
        </div>
        <details ref={nav} className={t.nav}>
          <summary>Bảng câu hỏi</summary>
          {PARTS.map((x) => (
            <div key={x}>
              <p className={t.navPart}>Part {x}</p>
              <div className={t.cells}>
                {order.filter((n) => index.get(n)?.group.part === x).map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={t.cell}
                    aria-current={n === view.current}
                    aria-label={`Câu ${n}${answers.has(n) ? ', đã làm' : ''}${flags.has(n) ? ', đã đánh dấu' : ''}`}
                    data-done={answers.has(n) || undefined}
                    data-flag={flags.has(n) || undefined}
                    onClick={() => jump(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className={t.legend} aria-hidden="true">
            <span><i data-cur="" /> Đang xem</span>
            <span><i data-done="" /> Đã làm</span>
            <span><i data-flag="" /> Đã đánh dấu</span>
            <span><i /> Chưa làm</span>
          </p>
        </details>
        <div className={t.split} data-solo={group.passages.length === 0 || undefined}>
          {group.passages.length > 0 && (
            <div className={t.pane} data-under-bar="">
              <Passages group={group} gap={group.part === 6 ? gapAt(group, view.current) : null} />
            </div>
          )}
          <div>
            <div className={t.qs}>
              {group.questions.map((q) => (
                <ToeicQuestion
                  key={q.number}
                  group={group}
                  q={q}
                  mode="exam"
                  chosen={answers.get(q.number)}
                  current={q.number === view.current}
                  flagged={flags.has(q.number)}
                  onChoose={(i) => { choose(q.number, i); go(q.number) }}
                  onFlag={() => setFlags((f) => {
                    const next = new Set(f)
                    if (!next.delete(q.number)) next.add(q.number)
                    return next
                  })}
                />
              ))}
            </div>
            <div className={t.steps}>
              <button type="button" className={p.ghost} disabled={at <= 0} onClick={() => go(order[at - 1])}>Câu trước</button>
              {at < order.length - 1
                ? <button type="button" className={p.btn} onClick={() => go(order[at + 1])}>Câu sau</button>
                : <button type="button" className={p.btn} onClick={() => setConfirming(true)}>Nộp bài</button>}
            </div>
          </div>
        </div>
        <ConfirmDialog
          open={confirming}
          title="Nộp bài?"
          message={open > 0 ? `Còn ${open} câu chưa làm. Đã nộp thì không sửa được.` : 'Đã nộp thì không sửa được.'}
          confirmLabel="Nộp bài"
          onConfirm={() => finish(view.session)}
          onCancel={() => setConfirming(false)}
        />
      </>
    )
  } else if (view.at === 'practice') {
    const steps = groupsOf(test, view.session.numbers)
    const { group, questions } = steps[Math.min(view.step, steps.length - 1)]
    const done = questions.every((q) => answers.has(q.number))
    const shown = questions.find((q) => q.number === focus)
    const last = view.step >= steps.length - 1
    body = (
      <>
        <div className={p.bar}>
          <Link href={TOEIC_PATH}>← Thoát</Link>
          <span>{view.session.label} · {view.step + 1}/{steps.length}</span>
        </div>
        <div className={p.track} aria-hidden="true"><i style={{ transform: `scaleX(${(view.step + (done ? 1 : 0)) / steps.length})` }} /></div>
        <div className={t.split} data-solo={group.passages.length === 0 || undefined}>
          {group.passages.length > 0 && (
            <div className={t.pane}>
              <Passages group={group} evidence={shown && answers.has(shown.number) ? evidenceAt(group, shown) : null} />
            </div>
          )}
          <div>
            <div className={t.qs}>
              {questions.map((q) => (
                <ToeicQuestion
                  key={q.number}
                  group={group}
                  q={q}
                  mode="practice"
                  chosen={answers.get(q.number)}
                  onChoose={(i) => choose(q.number, i)}
                />
              ))}
            </div>
            {done && (
              <div className={t.steps}>
                <span />
                <button
                  type="button"
                  className={p.btn}
                  onClick={() => {
                    if (last) finish(view.session)
                    else { setView({ ...view, step: view.step + 1 }); setFocus(null); top() }
                  }}
                >
                  {last ? 'Xem kết quả' : 'Tiếp'}
                </button>
              </div>
            )}
          </div>
        </div>
      </>
    )
  } else {
    const { session } = view
    const items = session.numbers.flatMap((n) => {
      const hit = index.get(n)
      return hit ? [{ ...hit, chosen: answers.get(n) }] : []
    })
    const wrong = items.filter((i) => i.chosen !== i.q.answer).map((i) => i.q.number)
    body = (
      <ToeicResults
        items={items}
        timed={session.timed}
        onRetryWrong={() => begin({ at: 'practice', session: { label: 'Câu sai', numbers: wrong, timed: false }, step: 0 })}
        onRestart={() => begin({ at: 'start' })}
      />
    )
  }

  return (
    <WordsProvider words={words}>
      <main className={`${p.pr} ${p.stage} font-ui`}>
        <div className="mx-auto w-full max-w-page px-6 pt-4 pb-16">{body}</div>
      </main>
    </WordsProvider>
  )
}
