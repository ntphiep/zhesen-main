import { STUDY_TIMEZONE } from './activity'

/**
 * The date shown beside a saved word.
 *
 * Pinned to the study timezone rather than the machine's, because the same code
 * runs twice in two places: `WordlistClient` is a Client Component rendered by a
 * Server Component, so the server formats it first and the browser formats it
 * again. Those disagreed -- `2026-06-19T20:00:00Z` is 19/6 on a UTC server and
 * 20/6 in Vietnam -- so every word saved after 17:00 local time showed the wrong
 * day in the HTML and then jumped once React hydrated.
 *
 * `lib/wordlist/activity.ts` already learned this for the streak. The constant
 * is imported from there rather than written out again.
 */
export function formatWordDate(iso: string): string {
  // An unparseable value gives an Invalid Date, whose toLocaleDateString returns
  // the string "Invalid Date" rather than throwing -- so the try/catch this
  // replaced never fired, and the table would have printed that to the reader.
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('vi-VN', { timeZone: STUDY_TIMEZONE })
}

/**
 * The due date shown in the review column.
 *
 * A word the scheduler wants back reads "Cần ôn" rather than a date in the past:
 * the date itself tells a learner nothing, and an overdue list is the one thing
 * this column exists to make obvious. `now` is a parameter with a default so the
 * clock is read here and not in a component body, which React 19 forbids.
 */
export function formatDueDate(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso
  return t <= now ? 'Cần ôn' : formatWordDate(iso)
}
