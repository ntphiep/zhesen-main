'use client'
import { Suspense, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import Link from 'next/link'
import { AddToWordlistButton } from '@/components/lookup/AddToWordlistButton'
import { practiceModes } from '@/components/practice/PracticeModes'
import { AudioButton } from '@/components/ui/AudioButton'
import { LayoutPicker } from '@/components/ui/LayoutPicker'
import { entryPath } from '@/lib/dictionary/entryId'
import { formatPronunciation } from '@/lib/dictionary/pronunciation'
import { recentEntries } from '@/lib/dictionary/recent'
import { fetchSearch, REFUSED_MESSAGE } from '@/lib/dictionary/searchClient'
import type { DictEntryPreview } from '@/lib/dictionary/types'
import { HOME_LAYOUTS, homeLayout, type HomeLayout } from '@/lib/home/homeLayout'
import { useDailyGoal } from '@/lib/hooks/useDailyGoal'
import type { HomeView } from '@/lib/hooks/useHomeData'
import { useReducedMotion } from '@/lib/hooks/useReducedMotion'
import { byLang, type LangCode } from '@/lib/languages'
import { MAX_FREEZES, streakState } from '@/lib/wordlist/activity'
import { longDate } from '@/lib/wordlist/forecast'
import { GOAL_CHOICES, goalProgress } from '@/lib/wordlist/goal'
import l from './Landing.module.css'
import h from './Home.module.css'

/** The order the globe and the landing page's lanes use. */
export const ORDER: readonly LangCode[] = ['en', 'zh', 'es']
export const NAME = byLang((x) => x.name)
/** "tiếng Anh", for the middle of a sentence. */
export const NAME_MID = byLang((x) => x.name.replace('Tiếng', 'tiếng'))

export function Hw({ lang, text, className }: { lang: LangCode; text: string; className?: string }) {
  return <span className={className ? `${h.hw} ${className}` : h.hw} data-l={lang} lang={lang}>{text}</span>
}

/** Pinyin for Chinese, else the first IPA transcription. */
export function pronOf(w: { lang: LangCode; ipa: string | null; reading?: string | null }): string {
  if (w.lang === 'zh') return w.reading || w.ipa || ''
  return formatPronunciation((w.ipa ?? '').split(/ ~ | \[/)[0], w.lang) ?? ''
}

export function Pron({ w, className }: { w: { lang: LangCode; ipa: string | null; reading?: string | null }; className: string }) {
  return <span className={`${className} ${h.pron}`} data-l={w.lang}>{pronOf(w)}</span>
}

/** A number that counts up to `value` once it is known, eased, unless motion is reduced.
 *  Until then a soft block holds its place. */
export function CountUp({ value, ms = 700 }: { value: number | null; ms?: number }) {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    if (value === null || reduced) return
    const start = from.current
    const t0 = performance.now()
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms)
      const v = Math.round(start + (value - start) * (1 - Math.pow(1 - k, 3)))
      from.current = v
      setShown(v)
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value, reduced, ms])
  if (value === null) return <span className={h.num} data-wait="" />
  return <span className={h.num}>{reduced ? value : shown}</span>
}

/** How many words the next session hands over; a failed read says so and offers the retry. */
export function DueTitle({ due, failed, onRetry }: { due: number | null; failed: boolean; onRetry: () => void }) {
  if (failed) {
    return (
      <div role="alert">
        <h1 className={h.today}>Chưa tải được.</h1>
        <button type="button" className={`${h.btn} ${h.retry}`} onClick={onRetry}>Thử lại</button>
      </div>
    )
  }
  return <h1 className={h.today}><CountUp value={due} ms={800} /> từ đến hạn ôn hôm nay.</h1>
}

const ICONS: Record<HomeLayout, ReactNode> = {
  desk: <><rect x="2" y="3" width="10" height="14" rx="1.5" /><rect x="14" y="3" width="4" height="6" rx="1" /><rect x="14" y="11" width="4" height="6" rx="1" /></>,
  today: <><rect x="4" y="3" width="12" height="11" rx="2" /><path d="M7 17h6" /></>,
  orbit: <><circle cx="10" cy="10" r="7" /><path d="M3 10h14M10 3c2.4 2.2 2.4 11.8 0 14M10 3c-2.4 2.2-2.4 11.8 0 14" /></>,
}

/** `value` and `stored` are null until hydration, when the boot CSS marks the picker. */
export interface PickerState {
  value: HomeLayout | null
  stored: HomeLayout | null
}

/** The date and the layout picker, above every layout. */
export function HomeBar({ now, picker }: { now: number | null; picker: PickerState }) {
  return (
    <div className={`${h.wrap} ${h.bar}`}>
      <p className={h.eyebrow}>{now !== null && longDate(now)}</p>
      <div>
        <LayoutPicker
          value={picker.value}
          stored={picker.stored}
          options={HOME_LAYOUTS}
          icons={ICONS}
          fallback="desk"
          onPick={homeLayout.set}
        />
      </div>
    </div>
  )
}

type Answers = Record<LangCode, DictEntryPreview[]>
type LookupState =
  | { status: 'idle' }
  | { status: 'ok'; query: string; entries: Answers; seq: number }
  | { status: 'refused'; message: string }

const hasText = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().length > 1

/** The Vietnamese-direction lookup of the home page: one box, answered in three panes. */
export function useHomeLookup() {
  const [state, setState] = useState<LookupState>({ status: 'idle' })
  const ctrl = useRef<AbortController | null>(null)
  const timer = useRef(0)
  const seq = useRef(0)

  useEffect(() => () => { ctrl.current?.abort(); window.clearTimeout(timer.current) }, [])

  function run(raw: string) {
    const query = raw.trim()
    window.clearTimeout(timer.current)
    if (!query) return
    ctrl.current?.abort()
    const c = new AbortController()
    ctrl.current = c
    fetchSearch(query, c.signal, { dir: 'vi' })
      .then((out) => {
        if (c.signal.aborted) return
        setState(out.status === 'ok'
          ? { status: 'ok', query, entries: out.data.entries, seq: ++seq.current }
          : { status: 'refused', message: out.message })
      })
      .catch(() => { if (!c.signal.aborted) setState({ status: 'refused', message: REFUSED_MESSAGE }) })
  }

  function typed(v: string) {
    window.clearTimeout(timer.current)
    if (!v.trim()) { ctrl.current?.abort(); setState({ status: 'idle' }); return }
    if (hasText(v)) timer.current = window.setTimeout(() => run(v), 450)
  }

  return { state, run, typed }
}
export type HomeLookup = ReturnType<typeof useHomeLookup>

export function LookupBox({ lookup, placeholder }: { lookup: HomeLookup; placeholder: string }) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  return (
    <form
      className={l.box}
      role="search"
      onSubmit={(e) => { e.preventDefault(); lookup.run(input.current?.value || placeholder) }}
    >
      <label htmlFor={id}>Gõ một từ tiếng Việt</label>
      <input
        ref={input}
        id={id}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        onChange={(e) => lookup.typed(e.target.value)}
      />
      <button type="submit">Tra</button>
    </form>
  )
}

/** The save button loads its signed-in half lazily. Its own boundary keeps that load from
 *  suspending the layout around it, which hid the whole home for about 300 ms. */
export function SaveSlot({ entry }: { entry: DictEntryPreview }) {
  return <Suspense><AddToWordlistButton entry={entry} tone="pane" /></Suspense>
}

function record(e: DictEntryPreview) {
  recentEntries.record({ id: e.id, headword: e.headword, lang: e.lang, glossVi: e.glossVi ?? null })
}

export function LookupAnswers({ lookup }: { lookup: HomeLookup }) {
  const { state } = lookup
  return (
    <section className={h.wrap} aria-label="Kết quả tra">
      <div className={h.lite} hidden={state.status === 'idle'} aria-live="polite">
        {state.status === 'refused' && <p className={h.fail}>{state.message}</p>}
        {state.status === 'ok' && ORDER.map((lang) => {
          const top = state.entries[lang][0]
          return (
            <div key={`${lang}-${state.seq}`} className={h.pane} data-l={lang}>
              <div className={h.ph}><span>{NAME[lang]}</span>{top?.level && <span className={h.lv}>{top.level}</span>}</div>
              {top ? (
                <>
                  <Link href={entryPath(top.id)} prefetch={false} className={`${h.word} ${h.hw}`} data-l={lang} lang={lang} onClick={() => record(top)}>
                    {top.headword}
                  </Link>
                  <Pron w={top} className={h.pr} />
                  <span className={h.gl}>{top.glossVi}</span>
                  <div className={h.acts}>
                    <AudioButton text={top.headword} lang={lang} audioUrl={top.audioUrl} label="Nghe" tone="pane" />
                    <SaveSlot entry={top} />
                  </div>
                </>
              ) : (
                <p className={h.none}>Chưa có từ {NAME_MID[lang]} cho “{state.query}”.</p>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** The words this browser opened last, from the lookup boxes. */
export function RecentChips({ max }: { max: number }) {
  const recent = useSyncExternalStore(recentEntries.subscribe, recentEntries.snapshot, recentEntries.serverSnapshot)
  if (!recent.length) return null
  return (
    <div className={h.recent}>
      <p className={h.lbl}>Tra gần đây</p>{' '}
      <div className={h.chips}>
        {recent.slice(0, max).map((e) => (
          <Link key={e.id} className={h.chip} href={entryPath(e.id)} prefetch={false} title={e.glossVi ?? undefined}>
            <Hw lang={e.lang} text={e.headword} />
          </Link>
        ))}
      </div>
    </div>
  )
}

/** The practice modes other than review, as one quiet line under the main action. */
export function ModeLinks() {
  const id = useId()
  return (
    <nav className={h.others} aria-labelledby={id}>
      <span id={id}>Luyện cách khác</span>
      {practiceModes(null).slice(1).map((m) => (
        <Link key={m.href} href={m.href} prefetch={false}>{m.label}</Link>
      ))}
    </nav>
  )
}

/** The streak with the freezes it holds, and today's reviews against the daily goal: the
 *  one place each layout shows them. */
export function DayStats({ view }: { view: HomeView | null }) {
  return (
    <div className={h.facts}>
      <StreakFact view={view} />
      <GoalFact done={view?.reviewedToday ?? null} />
    </div>
  )
}

function StreakFact({ view }: { view: HomeView | null }) {
  const s = useMemo(() => (view ? streakState([...view.days], view.now) : null), [view])
  return (
    <div className={h.fact}>
      <b><CountUp value={view?.streak ?? null} /></b>
      <span>ngày học liền</span>
      {s && (
        <>
          <p className={h.frz}>
            {Array.from({ length: MAX_FREEZES }, (_, i) => (
              <svg key={i} aria-hidden="true" viewBox="0 0 16 16" data-on={i < s.freezes || undefined}>
                <path d="M8 1.5 2.5 3.6v4c0 3.3 2.3 5.8 5.5 6.9 3.2-1.1 5.5-3.6 5.5-6.9v-4z" />
              </svg>
            ))}
            <span>{s.freezes}/{MAX_FREEZES} lượt giữ chuỗi</span>
          </p>
          {s.savedYesterday && <p className={h.frzNote}>Hôm qua đã dùng một lượt giữ chuỗi.</p>}
        </>
      )}
    </div>
  )
}

/** Today's words reviewed against the goal the reader picked, remembered per browser. */
function GoalFact({ done }: { done: number | null }) {
  const [goal, setGoal] = useDailyGoal()
  const id = useId()
  const p = done === null ? null : goalProgress(done, goal)
  return (
    <div className={h.fact} data-met={p?.met || undefined}>
      <b><CountUp value={done} ms={300} /><small>/{goal}</small></b>
      <span>{p?.met ? 'Đủ mục tiêu hôm nay' : 'từ đã ôn hôm nay'}</span>
      <div
        className={h.goal}
        role="progressbar"
        aria-labelledby={id}
        aria-valuemin={0}
        aria-valuemax={goal}
        aria-valuenow={p ? Math.min(p.done, goal) : undefined}
      >
        <i style={{ transform: `scaleX(${p?.share ?? 0})` }} />
      </div>
      <div className={h.goalRow}>
        <span id={id}>Mục tiêu mỗi ngày</span>
        <div className={h.goalPick} role="group" aria-labelledby={id}>
          {GOAL_CHOICES.map((g) => (
            <button key={g} type="button" aria-pressed={g === goal} onClick={() => setGoal(g)}>{g}</button>
          ))}
        </div>
      </div>
    </div>
  )
}
