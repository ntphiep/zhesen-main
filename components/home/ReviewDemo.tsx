'use client'
import { useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react'
import { initialSrsState, review } from '@/lib/progress/srs'
import type { Grade, SrsState } from '@/lib/progress/types'
import { gradeForMode, type PracticeMode } from '@/lib/practice/grading'
import { checkTypedAnswer } from '@/lib/practice/typing'
import { buildMatchTiles, type MatchTile } from '@/lib/practice/match'
import { shuffle } from '@/lib/practice/shuffle'
import { getRecognitionCtor } from '@/lib/practice/recognition'
import { byLang, speechLang, type LangCode } from '@/lib/languages'
import { formatPronunciation } from '@/lib/dictionary/pronunciation'
import { seenWords, type SeenWord } from '@/lib/home/seenWords'
import type { Answers } from '@/lib/home/landing'
import { EXAMPLE_QUERY, MATCH_FILL, QUIZ_DISTRACTORS } from '@/lib/home/content'
import { AudioButton } from '@/components/ui/AudioButton'
import { onTabKey } from './tabs'
import s from './Landing.module.css'

/** Six ways to practise the word just looked up, all moving one schedule. Nothing is
 *  saved: the schedule is simulated from today, one review per due date. */

// The self-graded review is the 'card' mode here; the demo shows the six original modes.
type Mode = 'card' | Extract<PracticeMode, 'quiz' | 'write' | 'dictation' | 'match' | 'speak'>
const DAY = 86_400_000
const LABEL: Record<Grade, string> = { again: 'Lại', hard: 'Khó', good: 'Tốt', easy: 'Dễ' }
const GRADES: Grade[] = ['again', 'hard', 'good', 'easy']
const NAME = byLang((l) => l.name.replace('Tiếng', 'tiếng'))
const SHORT: Record<LangCode, string> = { en: 'Anh', zh: 'Trung', es: 'Tây Ban Nha' }
const ORDER: LangCode[] = ['en', 'zh', 'es']
const fmt = (t: number) => { const d = new Date(t); return `${d.getDate()}/${d.getMonth() + 1}` }
/** How long until a card is back: a learning step is minutes, not "0 ngày". */
const after = (next: SrsState, from: number) => next.scheduledDays > 0
  ? `${next.scheduledDays} ngày` : `${Math.max(1, Math.round((next.dueAt - from) / 60_000))} phút`

const MIC_PATHS = <><rect x="7" y="2.5" width="6" height="10" rx="3" /><path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5" /></>
const MIC = <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{MIC_PATHS}</svg>
const ICON = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
const MODES: { id: Mode; title: string; small: string; icon: ReactNode }[] = [
  { id: 'card', title: 'Ôn từ', small: 'Hiện nghĩa rồi tự chấm nhớ tới đâu.', icon: <svg viewBox="0 0 20 20" {...ICON}><rect x="3" y="5" width="11" height="12" rx="2" /><path d="M7 3h8a2 2 0 0 1 2 2v9" /></svg> },
  { id: 'quiz', title: 'Kiểm tra', small: 'Chọn đúng nghĩa của từ.', icon: <svg viewBox="0 0 20 20" {...ICON}><circle cx="10" cy="10" r="7" /><path d="m7 10 2.2 2.2L13.5 8" /></svg> },
  { id: 'write', title: 'Viết từ', small: 'Nhìn nghĩa tiếng Việt, gõ lại từ. Sai một chữ cái chỉ tính là gần đúng.', icon: <svg viewBox="0 0 20 20" {...ICON}><path d="M4 16l.8-3.4L13 4.4a1.6 1.6 0 0 1 2.3 0l.3.3a1.6 1.6 0 0 1 0 2.3L7.4 15.2z" /><path d="M11.5 6l2.5 2.5" /></svg> },
  { id: 'dictation', title: 'Nghe và chép', small: 'Nghe phát âm rồi gõ lại từ vừa nghe.', icon: <svg viewBox="0 0 20 20" {...ICON}><path d="M4 12v-2a6 6 0 0 1 12 0v2" /><rect x="3" y="12" width="3.5" height="5" rx="1.2" /><rect x="13.5" y="12" width="3.5" height="5" rx="1.2" /></svg> },
  { id: 'match', title: 'Ghép cặp', small: 'Nối từng từ với nghĩa của nó.', icon: <svg viewBox="0 0 20 20" {...ICON}><circle cx="5" cy="6" r="2" /><circle cx="15" cy="14" r="2" /><path d="M7 6h3a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h-1" /></svg> },
  { id: 'speak', title: 'Luyện nói', small: 'Đọc to cho máy nghe. Máy nghe nhầm thì không tính là quên.', icon: MIC },
]
const NOTES: Record<Mode, string> = {
  card: 'tự chấm Lại, Khó, Tốt hay Dễ',
  quiz: 'chọn đúng là Tốt, chọn sai là Lại',
  write: 'gõ sai một chữ cái chỉ tính là Khó',
  dictation: 'chấm như Viết từ, nhưng chỉ được nghe',
  match: 'ghép nhầm rồi mới đúng thì tính là Khó',
  speak: 'micro nghe nhầm thì không tính là quên',
}

interface Schedule { state: SrsState; clock: number; history: { at: number; grade: Grade; why: string | null }[] }

function freshSchedule(): Schedule {
  const d = new Date()
  d.setHours(9, 0, 0, 0)
  return { state: initialSrsState('landing', d.getTime()), clock: d.getTime(), history: [] }
}

function pronOf(w: SeenWord): string | null {
  const e = w.entry
  return e.lang === 'zh' ? e.reading || e.ipa : formatPronunciation((e.ipa ?? '').split(/ ~ | \[/)[0], e.lang)
}

export function ReviewDemo({ example }: { example: Answers | null }) {
  const seen = useSyncExternalStore(seenWords.subscribe, seenWords.snapshot, seenWords.serverSnapshot)
  const words: readonly SeenWord[] = seen.length || !example ? seen
    : ORDER.flatMap((l) => example[l].slice(0, 1).map((entry) => ({ query: EXAMPLE_QUERY, entry })))
  const [mode, setMode] = useState<Mode>('card')
  const current = words.find((w) => w.entry.lang === 'en') ?? words[0]
  const index = MODES.findIndex((m) => m.id === mode)
  const pick = (i: number) => setMode(MODES[i].id)
  return (
    <>
      <div className={s.modes} role="tablist" aria-label="Cách luyện" onKeyDown={(e: KeyboardEvent<HTMLElement>) => onTabKey(e, index, MODES.length, pick)}>
        {MODES.map((m, i) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            id={`mode-${m.id}`}
            aria-selected={mode === m.id}
            aria-controls="review-play"
            tabIndex={mode === m.id ? 0 : -1}
            data-reveal=""
            data-i={i}
            onClick={() => setMode(m.id)}
          >
            <span className={s.modeIc} aria-hidden="true">{m.icon}</span><b>{m.title}</b><small>{m.small}</small>
          </button>
        ))}
      </div>
      <div data-reveal="">
        {current
          ? <Stage key={current.entry.id} word={current} words={words} mode={mode} />
          : <div className={s.rstage}><div className={s.playArea}><p className={s.q}>Tra một từ ở đầu trang để luyện.</p></div></div>}
      </div>
    </>
  )
}

function Stage({ word, words, mode }: { word: SeenWord; words: readonly SeenWord[]; mode: Mode }) {
  const [sched, setSched] = useState<Schedule | null>(null)

  function grade(g: Grade | null, why: string | null) {
    if (!g) return
    const base = sched ?? freshSchedule()
    const next = review(base.state, g, base.clock)
    setSched({ state: next, clock: next.dueAt, history: [...base.history, { at: base.clock, grade: g, why }] })
  }
  function peek(): Record<Grade, string> {
    const base = sched ?? freshSchedule()
    return { again: '', hard: '', good: '', easy: '', ...Object.fromEntries(GRADES.map((g) => [g, after(review(base.state, g, base.clock), base.clock)])) }
  }

  const last = sched?.history.at(-1)
  return (
    <div className={s.rstage}>
      <div className={s.playArea} id="review-play" role="tabpanel" aria-labelledby={`mode-${mode}`}>
        <Play key={mode} mode={mode} word={word} words={words} onGrade={grade} peek={peek} />
        <p className={s.hand} aria-hidden="true">{NOTES[mode]}</p>
      </div>
      <div className={s.sched}>
        <div className={s.lbl}>Lịch ôn của từ này</div>
        <p className={s.when}>
          {sched && last
            ? `${LABEL[last.grade]}. Từ này quay lại sau ${after(sched.state, last.at)}, vào ngày ${fmt(sched.state.dueAt)}.`
            : 'Luyện một phiên, lịch ôn của từ này hiện ở đây.'}
        </p>
        <ol className={s.log}>
          {sched?.history.map((h, i) => <li key={i}>Lần {i + 1}, ngày {fmt(h.at)}: {h.why ? `${h.why}, ` : ''}{LABEL[h.grade]}.</li>)}
        </ol>
        <Track sched={sched} />
      </div>
    </div>
  )
}

function Track({ sched }: { sched: Schedule | null }) {
  const history = sched?.history ?? []
  const start = history[0]?.at ?? 0
  const due = sched && history.length ? sched.state.dueAt : null
  const lastDay = due ? (due - start) / DAY : 0
  const span = [12, 28, 60, 120, 240, 480].find((d) => d >= lastDay * 1.08) ?? Math.ceil(lastDay * 1.1)
  const x = (t: number) => `${Math.min(100, ((t - start) / DAY / span) * 100)}%`
  return (
    <div className={s.track} aria-hidden="true">
      {[0, span / 2, span].map((d) => (
        <span key={d} className={s.tick} data-edge={d === 0 ? 'first' : d === span ? 'last' : undefined} style={{ left: `${(d / span) * 100}%` }}>
          {d === 0 ? 'Hôm nay' : `${Math.round(d)} ngày`}
        </span>
      ))}
      {history.map((h, i) => <span key={i} className={s.pt} style={{ left: x(h.at) }}><span>{i + 1}</span></span>)}
      {due !== null && <span className={s.pt} data-due="" style={{ left: x(due) }}><span>{fmt(due)}</span></span>}
    </div>
  )
}

interface PlayProps {
  mode: Mode
  word: SeenWord
  words: readonly SeenWord[]
  onGrade: (g: Grade | null, why: string | null) => void
  peek: () => Record<Grade, string>
}

function Play(props: PlayProps) {
  switch (props.mode) {
    case 'card': return <CardPlay {...props} />
    case 'quiz': return <QuizPlay {...props} />
    case 'write': case 'dictation': return <TypePlay {...props} />
    case 'match': return <MatchPlay {...props} />
    case 'speak': return <SpeakPlay {...props} />
  }
}

function Big({ text, lang }: { text: string; lang: string }) {
  return <div className={s.big} lang={lang}>{text}</div>
}

function CardPlay({ word, onGrade, peek }: PlayProps) {
  const [days, setDays] = useState<Record<Grade, string> | null>(null)
  const flip = useRef<HTMLButtonElement>(null)
  const good = useRef<HTMLButtonElement>(null)
  const e = word.entry
  return (
    <>
      <div className={s.q}>Ôn từ, {NAME[e.lang]}</div>
      <Big text={e.headword} lang={e.lang} />
      <div className={s.sub}>{pronOf(word)}</div>
      <button
        ref={flip}
        type="button"
        className={s.solid}
        hidden={days !== null}
        onClick={() => { setDays(peek()); requestAnimationFrame(() => good.current?.focus()) }}
      >
        Hiện nghĩa
      </button>
      <div className={s.back} hidden={days === null}>{word.query}</div>
      <div className={s.rowBtns}>
        {GRADES.map((g) => (
          <button
            key={g}
            ref={g === 'good' ? good : undefined}
            type="button"
            disabled={days === null}
            onClick={() => { onGrade(g, null); setDays(null); requestAnimationFrame(() => flip.current?.focus()) }}
          >
            {LABEL[g]}<small>{days ? days[g] : ''}</small>
          </button>
        ))}
      </div>
    </>
  )
}

function QuizPlay({ word, onGrade }: PlayProps) {
  const q = word.query
  const [options] = useState(() => shuffle([q, ...QUIZ_DISTRACTORS.filter((x) => x !== q).slice(0, 3)]))
  const [picked, setPicked] = useState<string | null>(null)
  return (
    <>
      <div className={s.q}>Kiểm tra: chọn nghĩa đúng</div>
      <Big text={word.entry.headword} lang={word.entry.lang} />
      <div className={s.choices}>
        {options.map((o) => (
          <button
            key={o}
            type="button"
            className={s.choice}
            data-state={picked === null ? undefined : o === q ? 'ok' : o === picked ? 'no' : undefined}
            onClick={() => {
              if (picked !== null) return
              setPicked(o)
              const correct = o === q
              onGrade(gradeForMode('quiz', { correct }), correct ? 'chọn đúng' : 'chọn sai')
            }}
          >
            {o}
          </button>
        ))}
      </div>
      <div className={s.verdict} role="status">{picked === null ? '' : picked === q ? 'Đúng.' : `Đáp án là ${q}.`}</div>
    </>
  )
}

function TypePlay({ mode, word, onGrade }: PlayProps) {
  const [verdict, setVerdict] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const listen = mode === 'dictation'
  const e = word.entry
  return (
    <>
      <div className={s.q}>{listen ? 'Nghe rồi gõ từ' : `Nhìn nghĩa, gõ từ ${NAME[e.lang]}`}</div>
      {listen
        ? <div className={s.rowBtns}><AudioButton text={e.headword} lang={e.lang} audioUrl={e.audioUrl} label="Nghe" tone="pane" /></div>
        : <Big text={word.query} lang="vi" />}
      <form
        className={s.type}
        onSubmit={(ev) => {
          ev.preventDefault()
          const got = input.current?.value ?? ''
          if (!got.trim()) return
          const r = checkTypedAnswer(got, e.headword)
          setVerdict(r === 'correct' ? 'Đúng.' : r === 'close' ? `Gần đúng, sai một chữ cái. Từ đúng là ${e.headword}.` : `Từ đúng là ${e.headword}.`)
          onGrade(gradeForMode(listen ? 'dictation' : 'write', { correct: r !== 'wrong', nearly: r === 'close' }), r === 'correct' ? 'gõ đúng' : r === 'close' ? 'sai một chữ cái' : 'gõ sai')
        }}
      >
        <input ref={input} aria-label="Từ vừa gõ" autoComplete="off" spellCheck={false} placeholder="Gõ ở đây" lang={e.lang} />
        <button type="submit">Kiểm tra</button>
      </form>
      <div className={s.verdict} role="status">{verdict}</div>
    </>
  )
}

function MatchPlay({ words, onGrade }: PlayProps) {
  const [tiles] = useState<MatchTile[]>(() => {
    const pairs: { id: string; headword: string; meaningVi: string; lang: LangCode }[] = []
    for (const w of words) if (!pairs.some((p) => p.meaningVi === w.query)) pairs.push({ id: w.entry.id, headword: w.entry.headword, meaningVi: w.query, lang: w.entry.lang })
    for (const f of MATCH_FILL) {
      if (pairs.length >= 4) break
      if (!pairs.some((p) => p.meaningVi === f.meaningVi)) pairs.push({ id: `fill-${f.headword}`, ...f })
    }
    return buildMatchTiles(pairs.slice(0, 4), 4)
  })
  const [langs] = useState(() => new Map([
    ...words.map((w): [string, LangCode] => [w.entry.id, w.entry.lang]),
    ...MATCH_FILL.map((f): [string, LangCode] => [`fill-${f.headword}`, f.lang]),
  ]))
  const [sel, setSel] = useState<MatchTile | null>(null)
  const [solved, setSolved] = useState<string[]>([])
  const [wrong, setWrong] = useState<string[]>([])
  const [misses, setMisses] = useState(0)
  const pairs = tiles.length / 2
  const done = solved.length === pairs
  function click(t: MatchTile) {
    if (solved.includes(t.wordId)) return
    if (!sel || sel.kind === t.kind) { setSel(t); return }
    if (sel.wordId === t.wordId) {
      const next = [...solved, t.wordId]
      setSolved(next)
      setSel(null)
      if (next.length === pairs) onGrade(gradeForMode('match', { correct: true, nearly: misses > 0 }), misses ? 'nối nhầm rồi mới đúng' : 'nối đúng ngay')
      return
    }
    setMisses((m) => m + 1)
    setWrong([sel.key, t.key])
    setSel(null)
    window.setTimeout(() => setWrong([]), 300)
  }
  return (
    <>
      <div className={s.q}>Nối từ với nghĩa</div>
      <div className={s.tiles}>
        {tiles.map((t) => {
          const lang = langs.get(t.wordId)
          return (
            <button
              key={t.key}
              type="button"
              className={s.tile}
              data-state={solved.includes(t.wordId) ? 'ok' : wrong.includes(t.key) ? 'no' : sel?.key === t.key ? 'sel' : undefined}
              onClick={() => click(t)}
            >
              {t.kind === 'word' && lang ? <><span lang={lang}>{t.text}</span><small>{SHORT[lang]}</small></> : t.text}
            </button>
          )
        })}
      </div>
      <div className={s.verdict} role="status">{done ? (misses ? `Xong, nối nhầm ${misses} lần.` : 'Xong, không nối nhầm lần nào.') : ''}</div>
    </>
  )
}

const noSubscribe = () => () => {}

function SpeakPlay({ word, onGrade }: PlayProps) {
  const canHear = useSyncExternalStore(noSubscribe, () => getRecognitionCtor() !== null, () => false)
  const [listening, setListening] = useState(false)
  const [verdict, setVerdict] = useState('')
  const e = word.entry
  function listen() {
    const Ctor = getRecognitionCtor()
    if (!Ctor || listening) return
    const r = new Ctor()
    r.lang = speechLang(e.lang)
    r.interimResults = false
    r.maxAlternatives = 3
    r.onresult = (ev) => {
      const alts = Array.from(ev.results[0] ?? [], (a) => a.transcript.trim())
      const best = alts.map((a) => checkTypedAnswer(a, e.headword)).find((v) => v !== 'wrong')
      setVerdict(best ? 'Nghe đúng.' : `Máy nghe thành “${alts[0] ?? ''}”. Lần này không ghi vào lịch ôn.`)
      onGrade(gradeForMode('speak', { correct: Boolean(best), nearly: best === 'close' }), 'đọc đúng')
    }
    r.onerror = () => setVerdict('Máy chưa nghe được. Lần này không ghi vào lịch ôn.')
    r.onend = () => setListening(false)
    setVerdict('')
    setListening(true)
    r.start()
  }
  return (
    <>
      <div className={s.q}>Đọc to, kiểm tra phát âm</div>
      <Big text={e.headword} lang={e.lang} />
      <div className={s.sub}>{pronOf(word)}</div>
      <button type="button" className={s.mic} aria-pressed={listening} aria-disabled={!canHear || undefined} onClick={listen}>
        {MIC}{canHear ? 'Bấm rồi đọc' : 'Trình duyệt này chưa nghe được giọng nói'}
      </button>
      <div className={s.verdict} role="status">{verdict}</div>
    </>
  )
}

