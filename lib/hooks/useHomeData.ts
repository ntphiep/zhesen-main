'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadSupabaseClient } from '@/lib/supabase/loadClient'
import { computeStreak, getActivityDays, getTodayEvents, studyDay, studyDayEnd } from '@/lib/wordlist/activity'
import { bucketForecast, listUpcoming, type ForecastDay, type ForecastWord } from '@/lib/wordlist/forecast'
import type { SrsState } from '@/lib/progress/types'
import type { ReviewCard } from '@/lib/wordlist/review'
import { progressPart, type LangProgress, type StatRow, type WordlistStats } from '@/lib/wordlist/stats'
import type { UserWord } from '@/lib/wordlist/types'
import type { LangCode } from '@/lib/languages'

/** How many days the desk's forecast covers, today included. */
export const FORECAST_DAYS = 7
/** How long the reads may go on after a request first fails. Its own retries take 7 s to
 *  give up (`onRequestFailure`); the first of them goes out 1 s after the failure. */
const FAILURE_GRACE_MS = 2500

interface Loaded {
  now: number
  stats: WordlistStats
  rows: StatRow[]
  progress: Record<LangCode, LangProgress>
  queue: ReviewCard[]
  leeches: UserWord[]
  upcoming: ForecastWord[]
  days: string[]
}

/** What the signed-in home draws, with this visit's grades already counted in. */
export interface HomeView {
  now: number
  /** What the next session hands over, the number every other page shows. */
  due: number
  total: number
  learned: number
  reviewedToday: number
  streak: number
  days: ReadonlySet<string>
  rows: StatRow[]
  progress: Record<LangCode, LangProgress>
  /** The session queue as loaded, less what this visit graded, then the words graded Lại
   *  with their new schedule, in the order they went back. */
  pending: ReviewCard[]
  /** Cards graded on this visit. */
  gradedNow: number
  leeches: UserWord[]
  forecast: ForecastDay[]
}

const asForecast = (c: ReviewCard): ForecastWord => ({ id: c.id, lang: c.lang, headword: c.headword, dueAt: c.state.dueAt })

/** One visit's grades on top of what was loaded. A graded card lands on the day its new
 *  schedule names and leaves today's count only when that day is not today; a word graded
 *  Lại (`again`, oldest first) stays in the session. Today's reviews count each word once,
 *  and the first grade makes today a study day. */
export function summarize(d: Loaded, graded: ReadonlyMap<string, SrsState>, again: readonly string[] = []): HomeView {
  const n = graded.size
  const today = studyDay(d.now)
  const days = n ? [...d.days, today] : d.days
  const cardOf = (id: string) => d.queue.find((c) => c.id === id)
  let left = 0
  let fresh = 0
  for (const [id, next] of graded) {
    if (next.dueAt > studyDayEnd(d.now)) left++
    const was = cardOf(id)?.state.lastReviewedAt
    if (typeof was !== 'number' || studyDay(was) !== today) fresh++
  }
  const back = again.flatMap((id) => {
    const card = cardOf(id)
    const next = graded.get(id)
    return card && next ? [{ ...card, state: next }] : []
  })
  const moved = [...graded.entries()].flatMap(([id, next]) => {
    const card = d.queue.find((c) => c.id === id)
    return card ? [{ ...asForecast(card), dueAt: next.dueAt }] : []
  })
  const queue = d.queue.filter((c) => !graded.has(c.id)).map(asForecast)
  const progress = structuredClone(d.progress)
  let learned = d.stats.learned
  for (const [id, next] of graded) {
    const card = d.queue.find((c) => c.id === id)
    if (!card) continue
    const was = progressPart(card.state.reps, card.state.scheduledDays)
    const is = progressPart(next.reps, next.scheduledDays)
    progress[card.lang][was]--
    progress[card.lang][is]++
    learned += Number(is === 'learned') - Number(was === 'learned')
  }
  return {
    now: d.now,
    due: Math.max(0, d.stats.due - left),
    total: d.stats.total,
    learned,
    reviewedToday: d.stats.reviewedToday + fresh,
    streak: computeStreak(days, d.now),
    days: new Set(days),
    rows: d.rows,
    progress,
    pending: [...d.queue.filter((c) => !graded.has(c.id)), ...back],
    gradedNow: n,
    leeches: d.leeches,
    forecast: bucketForecast(queue, [...d.upcoming.filter((w) => !graded.has(w.id)), ...moved], d.now, FORECAST_DAYS),
  }
}

/**
 * The reader's own numbers for `/`, read in the browser: `/` is cached for everyone, so
 * nothing personal can be in its HTML. Every module that reaches supabase-js loads through
 * `import()`, as in `PersonalStrip`, and only once `enabled` says a permanent account is
 * here. `status` is 'none' when getSession finds no session after all.
 */
export function useHomeData(enabled: boolean): {
  view: HomeView | null
  status: 'idle' | 'loading' | 'ready' | 'none' | 'failed'
  supabase: SupabaseClient | null
  /** `back` is true for a word graded Lại, which comes back at the end of the session. */
  graded: (id: string, next: SrsState, back: boolean) => void
  /** Reads everything again after a failure. */
  retry: () => void
} {
  const [loaded, setLoaded] = useState<{ data: Loaded; supabase: SupabaseClient } | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'none' | 'failed'>('idle')
  const [marks, setMarks] = useState<ReadonlyMap<string, SrsState>>(new Map())
  const [again, setAgain] = useState<readonly string[]>([])
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let live = true
    let stop = () => {}
    void (async () => {
      try {
        const { createClient, onRequestFailure } = await loadSupabaseClient()
        const supabase = createClient()
        const { data: auth } = await supabase.auth.getSession()
        if (!live) return
        if (!auth.session) { setStatus('none'); return }
        setStatus('loading')
        const [store, stats, review] = await Promise.all([
          import('@/lib/wordlist/store'),
          import('@/lib/wordlist/stats'),
          import('@/lib/wordlist/review'),
        ])
        if (!live) return
        const now = Date.now()
        const failing = new Promise<never>((_, reject) => {
          let timer: ReturnType<typeof setTimeout> | undefined
          const off = onRequestFailure(() => {
            timer ??= setTimeout(() => reject(new Error('a home read is still failing')), FAILURE_GRACE_MS)
          })
          stop = () => { off(); clearTimeout(timer) }
        })
        // Today's answers are read once and feed both the queue's new-card allowance and the stats.
        const todayRead = getTodayEvents(supabase, now)
        const [rows, days, today, queue, leeches, upcoming] = await Promise.race([Promise.all([
          stats.fetchStatRows(supabase),
          getActivityDays(supabase),
          todayRead,
          todayRead.then((t) => review.listDueCards(supabase, now, { ...review.SESSION_LIMITS, newToday: t.newToday })),
          store.listLeeches(supabase, store.LEECH_LAPSES, 6),
          listUpcoming(supabase, now, FORECAST_DAYS),
        ]), failing]).finally(() => stop())
        if (!live) return
        const data: Loaded = {
          now, rows, days, queue, leeches, upcoming,
          stats: stats.computeWordlistStats(rows, days, now, today),
          progress: stats.computeLangProgress(rows),
        }
        setLoaded({ data, supabase })
        setStatus('ready')
      } catch (e) {
        console.error('home data failed', e)
        if (live) setStatus('failed')
      }
    })()
    return () => { live = false; stop() }
  }, [enabled, attempt])

  const view = useMemo(() => (loaded ? summarize(loaded.data, marks, again) : null), [loaded, marks, again])
  const graded = useCallback((id: string, next: SrsState, back: boolean) => {
    setMarks((m) => new Map(m).set(id, next))
    setAgain((a) => {
      const rest = a.filter((x) => x !== id)
      return back ? [...rest, id] : rest
    })
  }, [])
  const retry = useCallback(() => {
    setStatus('loading')
    setAttempt((n) => n + 1)
  }, [])

  return { view, status, supabase: loaded?.supabase ?? null, graded, retry }
}
