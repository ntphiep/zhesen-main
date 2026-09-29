import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from '@/lib/zod'
import type { LangCode } from '@/lib/languages'
import { localDay } from './activity'

const DAY = 86_400_000

/** Days since the epoch of a timestamp's calendar day in the study timezone. */
export function dayIndex(ts: number): number {
  const [y, m, d] = localDay(ts).split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / DAY)
}

/** A word coming due, with only what a forecast line names. */
export interface ForecastWord {
  id: string
  lang: LangCode
  headword: string
  dueAt: number
}

const upcomingRow = z.object({
  id: z.string(),
  lang: z.enum(['zh', 'es', 'en']),
  headword: z.string(),
  fsrs_due_at: z.string(),
})

/** Words due after `now` and within the next `days` days, soonest first. RLS scopes the read. */
export async function listUpcoming(supabase: SupabaseClient, now: number, days: number): Promise<ForecastWord[]> {
  const { data, error } = await supabase.from('user_words')
    .select('id, lang, headword, fsrs_due_at')
    .gt('fsrs_due_at', new Date(now).toISOString())
    .lt('fsrs_due_at', new Date(now + days * DAY).toISOString())
    .order('fsrs_due_at', { ascending: true })
    .limit(1000)
  if (error) throw error
  return z.array(upcomingRow).parse(data ?? [])
    .map((r) => ({ id: r.id, lang: r.lang, headword: r.headword, dueAt: Date.parse(r.fsrs_due_at) }))
}

export interface ForecastDay {
  /** A timestamp on that day, for its label. */
  ts: number
  count: number
  words: ForecastWord[]
}

/** The reviews falling due on each of the next `days` study days. Today holds the session
 *  queue, which is what "today" can still hand over, plus anything due later today. */
export function bucketForecast(queue: ForecastWord[], upcoming: ForecastWord[], now: number, days: number): ForecastDay[] {
  const today = dayIndex(now)
  const out: ForecastDay[] = Array.from({ length: days }, (_, i) => ({ ts: now + i * DAY, count: 0, words: [] }))
  const seen = new Set<string>()
  for (const w of [...queue.map((q) => ({ ...q, dueAt: now })), ...upcoming]) {
    if (seen.has(w.id)) continue
    seen.add(w.id)
    const i = dayIndex(w.dueAt) - today
    if (i < 0 || i >= days) continue
    out[i].count++
    out[i].words.push(w)
  }
  return out
}

const WEEKDAY = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']
const WEEKDAY_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

function parts(ts: number): { m: number; d: number; wd: number } {
  const [y, m, d] = localDay(ts).split('-').map(Number)
  return { m, d, wd: new Date(Date.UTC(y, m - 1, d)).getUTCDay() }
}

/** "Thứ Ba, 29 tháng 9" */
export function longDate(ts: number): string {
  const p = parts(ts)
  return `${WEEKDAY[p.wd]}, ${p.d} tháng ${p.m}`
}

/** "29/9" */
export function shortDate(ts: number): string {
  const p = parts(ts)
  return `${p.d}/${p.m}`
}

export function weekday(ts: number, short = false): string {
  return (short ? WEEKDAY_SHORT : WEEKDAY)[parts(ts).wd]
}

/** Monday first, as a Vietnamese calendar reads: 0 for Monday, 6 for Sunday. */
export function mondayIndex(ts: number): number {
  return (parts(ts).wd + 6) % 7
}

/** When a due date falls, said relative to `now`. */
export function whenLabel(ts: number, now: number): string {
  const d = dayIndex(ts) - dayIndex(now)
  if (d === 0) return 'hôm nay'
  if (d === 1) return 'ngày mai'
  if (d > 1 && d < 7) return `${weekday(ts)} ${shortDate(ts)}`
  return shortDate(ts)
}

/** Where a due card stands: never graded, overdue by some days, or due today. */
export function dueNote(reps: number, dueAt: number, now: number): string {
  if (reps === 0) return 'mới lưu, chưa ôn'
  const late = dayIndex(now) - dayIndex(dueAt)
  return late > 0 ? `quá hạn ${late} ngày` : 'đến hạn hôm nay'
}
