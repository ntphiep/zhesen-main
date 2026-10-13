import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from '@/lib/zod'
import { fetchAllRows } from '@/lib/supabase/paginate'
import { getActivityDays, getTodayEvents, sinceLabel, STUDY_DAY_SHIFT_MS, studyDay } from '@/lib/wordlist/activity'
import { computeTodayPlan, fetchStatRows, fullStats, type TodayPlan, type WordlistStats } from '@/lib/wordlist/stats'
import { LEECH_LAPSES, listLeeches, parseUserWordRow, type UserWord } from '@/lib/wordlist/store'
import { MODE_SKILL, type PracticeMode } from './grading'
import { subsetHref } from './subset'

const DAY = 86_400_000

/** Weeks the hub's calendar shows, the current one last. */
export const CALENDAR_WEEKS = 12
/** A word missed this often in the last `FAIL_DAYS` is listed as failing, leech or not. */
export const FAILS_TO_LIST = 2
export const FAIL_DAYS = 30
export const FAILING_MAX = 6

const eventRow = z.object({
  word_id: z.string(),
  mode: z.string(),
  rating: z.number(),
  reviewed_at: z.string(),
})
type EventRow = z.infer<typeof eventRow>

const isMode = (m: string): m is PracticeMode => Object.hasOwn(MODE_SKILL, m)

export interface CalendarDay {
  /** The study day, 'YYYY-MM-DD'. */
  day: string
  /** Answers logged that day. */
  answers: number
  studied: boolean
  today: boolean
  future: boolean
}

/** The calendar's study days, Monday first, week by week, ending with the week of `now`. */
export function calendarDays(now: number, weeks = CALENDAR_WEEKS): string[] {
  const today = Date.parse(`${studyDay(now)}T00:00:00Z`)
  const monday = today - ((new Date(today).getUTCDay() + 6) % 7) * DAY
  const first = monday - (weeks - 1) * 7 * DAY
  return Array.from({ length: weeks * 7 }, (_, i) => new Date(first + i * DAY).toISOString().slice(0, 10))
}

/** When the study day `day` began. */
const dayStart = (day: string) => Date.parse(`${day}T00:00:00Z`) - STUDY_DAY_SHIFT_MS

export interface PracticeActivity {
  calendar: CalendarDay[]
  /** When each mode last graded an answer, within the calendar's weeks. */
  lastUsed: Partial<Record<PracticeMode, number>>
  /** Wrong answers per word over the last `FAIL_DAYS`. */
  fails: Map<string, number>
}

/** The answer log of the calendar's weeks, folded into what the hub draws. A day in
 *  `review_log` with no answer logged (before 0161) still counts as studied. */
export function summarizeEvents(rows: readonly EventRow[], activityDays: readonly string[], now: number): PracticeActivity {
  const perDay = new Map<string, number>()
  const lastUsed: Partial<Record<PracticeMode, number>> = {}
  const fails = new Map<string, number>()
  const failSince = now - FAIL_DAYS * DAY
  for (const r of rows) {
    const at = Date.parse(r.reviewed_at)
    const day = studyDay(at)
    perDay.set(day, (perDay.get(day) ?? 0) + 1)
    if (isMode(r.mode) && at > (lastUsed[r.mode] ?? 0)) lastUsed[r.mode] = at
    if (r.rating === 1 && at >= failSince) fails.set(r.word_id, (fails.get(r.word_id) ?? 0) + 1)
  }
  const studied = new Set(activityDays)
  const today = studyDay(now)
  const calendar = calendarDays(now).map((day) => {
    const answers = perDay.get(day) ?? 0
    return { day, answers, studied: answers > 0 || studied.has(day), today: day === today, future: day > today }
  })
  return { calendar, lastUsed, fails }
}

/** A word the learner keeps getting wrong, with how often. */
export interface FailingWord {
  word: UserWord
  misses: number
}

/** Words missed at least `FAILS_TO_LIST` times lately, then the leeches, most missed first. */
async function listFailing(supabase: SupabaseClient, fails: Map<string, number>): Promise<FailingWord[]> {
  const recent = [...fails].filter(([, n]) => n >= FAILS_TO_LIST).sort((a, b) => b[1] - a[1]).slice(0, FAILING_MAX)
  const [words, leeches] = await Promise.all([
    recent.length
      ? supabase.from('user_words').select('*').in('id', recent.map(([id]) => id)).then(({ data, error }) => {
        if (error) throw error
        return (data ?? []).map(parseUserWordRow)
      })
      : [],
    listLeeches(supabase, LEECH_LAPSES, FAILING_MAX),
  ])
  const out = new Map<string, FailingWord>()
  // Write mode asks for the word from its meaning, so one without a meaning is left out.
  for (const w of words) if (w.meaningVi?.trim()) out.set(w.id, { word: w, misses: fails.get(w.id) ?? 0 })
  for (const w of leeches) if (w.meaningVi?.trim() && !out.has(w.id)) out.set(w.id, { word: w, misses: w.fsrsLapses })
  return [...out.values()].sort((a, b) => b.misses - a.misses).slice(0, FAILING_MAX)
}

export interface Recommendation {
  /** The mode's page, which `practiceModes` names and draws. */
  mode: string
  href: string
  reason: string
}

/** The modes offered when nothing is due: each of them grades without a microphone. */
const ROTATION = ['quiz', 'write', 'match', 'dictation', 'listen', 'cloze'] as const

/** One thing to do now: recall that is due, then recognition that is due, then the words
 *  missed most, then the mode left longest. */
export function recommend(
  plan: TodayPlan, failing: readonly FailingWord[], lastUsed: PracticeActivity['lastUsed'], now: number,
  /** Whether the notebook holds a word with a recording: Chinese has none, so listen opens empty. */
  listenable = true,
): Recommendation {
  if (plan.recallDue > 0 || plan.newCards > 0) {
    const reason = plan.recallDue > 0
      ? `${plan.recallDue} từ cần ôn${plan.newCards > 0 ? ` và ${plan.newCards} từ mới` : ''}.`
      : `${plan.newCards} từ mới chờ học.`
    return { mode: '/practice/review', href: '/practice/review', reason }
  }
  if (plan.recognitionDue > 0) {
    return { mode: '/practice/quiz', href: subsetHref('/practice/quiz', { kind: 'due' }), reason: `${plan.recognitionDue} từ cần kiểm tra nghĩa.` }
  }
  if (failing.length > 0) {
    return { mode: '/practice/write', href: failingHref(failing), reason: `${failing.length} từ hay sai.` }
  }
  const [mode] = ROTATION.filter((m) => listenable || m !== 'listen').sort((a, b) => (lastUsed[a] ?? 0) - (lastUsed[b] ?? 0))
  const last = lastUsed[mode]
  return {
    mode: `/practice/${mode}`,
    href: `/practice/${mode}`,
    reason: last ? `Luyện lần cuối ${sinceLabel(last, now).toLowerCase()}.` : 'Chưa luyện cách này.',
  }
}

/** Writing them out, since a miss in any mode is a word not yet recalled. */
export function failingHref(failing: readonly FailingWord[]): string {
  return subsetHref('/practice/write', { kind: 'words', ids: failing.map((f) => f.word.id) })
}

export interface PracticeHub {
  now: number
  stats: WordlistStats
  plan: TodayPlan
  activity: PracticeActivity
  failing: FailingWord[]
  next: Recommendation
}

/** Everything /practice draws, read once. RLS scopes every read. */
export async function getPracticeHub(supabase: SupabaseClient, now: number = Date.now()): Promise<PracticeHub> {
  const since = new Date(dayStart(calendarDays(now)[0])).toISOString()
  const [rows, activityDays, today, events] = await Promise.all([
    fetchStatRows(supabase),
    getActivityDays(supabase),
    getTodayEvents(supabase, now),
    fetchAllRows((from, to) => supabase.from('review_events')
      .select('word_id, mode, rating, reviewed_at').gte('reviewed_at', since).order('reviewed_at').order('id').range(from, to)),
  ])
  const activity = summarizeEvents(eventRow.array().parse(events), activityDays, now)
  const failing = await listFailing(supabase, activity.fails)
  const plan = computeTodayPlan(rows, now, today.newToday)
  return {
    now,
    stats: fullStats(rows, activityDays, now, today),
    plan,
    activity,
    failing,
    next: recommend(plan, failing, activity.lastUsed, now, rows.some((r) => r.lang !== 'zh')),
  }
}
