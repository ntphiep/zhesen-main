'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadSupabaseClient } from '@/lib/supabase/loadClient'
import { computeStreak, getActivityDays, localDay } from '@/lib/wordlist/activity'
import { bucketForecast, listUpcoming, type ForecastDay, type ForecastWord } from '@/lib/wordlist/forecast'
import type { SrsState } from '@/lib/progress/types'
import type { ReviewCard } from '@/lib/wordlist/review'
import { progressPart, type LangProgress, type StatRow, type WordlistStats } from '@/lib/wordlist/stats'
import type { UserWord } from '@/lib/wordlist/types'
import type { LangCode } from '@/lib/languages'

/** How many days the desk's forecast covers, today included. */
export const FORECAST_DAYS = 7
/** Enough newest words for four per language on the globe layout. */
const RECENT = 24

interface Loaded {
  now: number
  stats: WordlistStats
  rows: StatRow[]
  progress: Record<LangCode, LangProgress>
  queue: ReviewCard[]
  recent: UserWord[]
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
  /** The session queue as loaded, less what this visit graded. */
  pending: ReviewCard[]
  /** Cards graded on this visit. */
  gradedNow: number
  recent: UserWord[]
  leeches: UserWord[]
  forecast: ForecastDay[]
}

const asForecast = (c: ReviewCard): ForecastWord => ({ id: c.id, lang: c.lang, headword: c.headword, dueAt: c.state.dueAt })

/** One visit's grades on top of what was loaded. A graded card leaves today's count and
 *  lands on the day its new schedule names; the first grade makes today a study day. */
export function summarize(d: Loaded, graded: ReadonlyMap<string, SrsState>): HomeView {
  const n = graded.size
  const days = n ? [...d.days, localDay(d.now)] : d.days
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
    due: Math.max(0, d.stats.due - n),
    total: d.stats.total,
    learned,
    reviewedToday: d.stats.reviewedToday + n,
    streak: computeStreak(days, d.now),
    days: new Set(days),
    rows: d.rows,
    progress,
    pending: d.queue.filter((c) => !graded.has(c.id)),
    gradedNow: n,
    recent: d.recent,
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
  graded: (id: string, next: SrsState) => void
} {
  const [loaded, setLoaded] = useState<{ data: Loaded; supabase: SupabaseClient } | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'none' | 'failed'>('idle')
  const [marks, setMarks] = useState<ReadonlyMap<string, SrsState>>(new Map())

  useEffect(() => {
    if (!enabled) return
    let live = true
    void (async () => {
      try {
        const { createClient } = await loadSupabaseClient()
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
        const now = Date.now()
        const [rows, days, queue, recent, leeches, upcoming] = await Promise.all([
          stats.fetchStatRows(supabase),
          getActivityDays(supabase),
          review.listDueCards(supabase, now, review.SESSION_LIMITS),
          store.listRecentWords(supabase, RECENT),
          store.listLeeches(supabase, store.LEECH_LAPSES, 6),
          listUpcoming(supabase, now, FORECAST_DAYS),
        ])
        if (!live) return
        const data: Loaded = {
          now, rows, days, queue, recent, leeches, upcoming,
          stats: stats.computeWordlistStats(rows, days, now),
          progress: stats.computeLangProgress(rows),
        }
        setLoaded({ data, supabase })
        setStatus('ready')
      } catch (e) {
        console.error('home data failed', e)
        if (live) setStatus('failed')
      }
    })()
    return () => { live = false }
  }, [enabled])

  const view = useMemo(() => (loaded ? summarize(loaded.data, marks) : null), [loaded, marks])
  const graded = useCallback((id: string, next: SrsState) => {
    setMarks((m) => new Map(m).set(id, next))
  }, [])

  return { view, status, supabase: loaded?.supabase ?? null, graded }
}
