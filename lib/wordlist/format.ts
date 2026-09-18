import { STUDY_TIMEZONE } from './activity'

/** The date shown beside a saved word, pinned to the study timezone rather than the
 *  machine's: the server formats it and the browser formats it again, and
 *  `2026-06-19T20:00:00Z` is 19/6 on a UTC server but 20/6 in Vietnam. */
export function formatWordDate(iso: string): string {
  // An unparseable value gives an Invalid Date, whose toLocaleDateString returns the
  // string "Invalid Date" rather than throwing, so a try/catch would never fire.
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('vi-VN', { timeZone: STUDY_TIMEZONE })
}

/** The label a word carries when the scheduler wants it back. Exported so no caller has to
 *  compare against the rendered string. */
export const DUE_LABEL = 'Cần ôn'

/** Whether the scheduler wants this word back already. `now` defaults here so the clock is
 *  never read in a component body, which React 19's purity rule forbids. */
export function isDueAt(iso: string, now: number = Date.now()): boolean {
  return Date.parse(iso) <= now
}
