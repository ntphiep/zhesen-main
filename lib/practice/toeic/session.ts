import { z } from '@/lib/zod'
import type { ToeicGroup, ToeicQuestion } from './tests'

export const TOEIC_PATH = '/practice/toeic'

export const toeicTestPath = (id: string) => `${TOEIC_PATH}/${encodeURIComponent(id)}`

export const LETTERS = ['A', 'B', 'C', 'D'] as const

/** The tag a word saved from a TOEIC test carries, the same as from a TOEIC topic. */
export const TOEIC_TAGS: readonly string[] = ['toeic']

export const EXAM_MS = 75 * 60 * 1000

/** The last session of each test, kept in this browser only. */
export const HISTORY_KEY = 'zhesen:toeic-results'

const record = z.object({
  at: z.number(),
  /** "Thi thử", "Part 5", "Câu sai". */
  label: z.string(),
  correct: z.number().int().min(0),
  total: z.number().int().min(1),
  /** Only a full timed test has a score range. */
  score: z.object({ low: z.number(), high: z.number() }).nullable(),
})

export type ToeicRecord = z.infer<typeof record>

export type ToeicHistory = Readonly<Record<string, ToeicRecord>>

/** One entry per test under a key another version or another tab may have written, parsed
 *  rather than cast. An entry that fails is dropped alone, the others stay. */
function parseEach<T>(raw: string | null, entry: z.ZodType<T>): Readonly<Record<string, T>> {
  if (!raw) return {}
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return {}
  }
  const all = z.record(z.string(), z.unknown()).safeParse(value)
  if (!all.success) return {}
  const out: Record<string, T> = {}
  for (const [id, v] of Object.entries(all.data)) {
    const one = entry.safeParse(v)
    if (one.success) out[id] = one.data
  }
  return out
}

export const parseHistory = (raw: string | null): ToeicHistory => parseEach(raw, record)

export const serializeHistory = (h: ToeicHistory) => JSON.stringify(h)

/** A session left before it ended, one per test, so leaving the page loses nothing. */
export const PROGRESS_KEY = 'zhesen:toeic-progress'

const progress = z.object({
  session: z.object({ label: z.string(), numbers: z.array(z.number().int()).min(1), timed: z.boolean() }),
  answers: z.array(z.tuple([z.number().int(), z.number().int().min(0).max(3)])),
  flags: z.array(z.number().int()),
  /** The timed test: time left in ms, paused while away, and the question on screen. */
  left: z.number().min(0).nullable(),
  current: z.number().int(),
  /** Practice: the group on screen. */
  step: z.number().int().min(0),
})

export type ToeicProgress = z.infer<typeof progress>

export type ToeicProgressMap = Readonly<Record<string, ToeicProgress>>

export const parseProgress = (raw: string | null): ToeicProgressMap => parseEach(raw, progress)

export const serializeProgress = (m: ToeicProgressMap) => JSON.stringify(m)

/** "62:05" for a number of ms. */
export function clock(ms: number): string {
  const s = Math.ceil(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** The cap of one chat turn in `lib/ai/tasks.ts`. */
const TURN_MAX = 1500

/** The question as the first turn of a chat: the item, the key, the learner's pick, the
 *  explanation and the passage line that proves it. */
export function askSeed(group: ToeicGroup, q: ToeicQuestion, chosen: number | undefined): string {
  const pick = (i: number) => `(${LETTERS[i]}) ${q.options[i]}`
  return [
    `Câu ${q.number} trong đề TOEIC Reading, Part ${group.part}.`,
    q.stem ? `Câu hỏi: ${q.stem}` : `Chỗ trống (${q.number}) trong đoạn văn.`,
    q.evidence ? `Dòng liên quan trong bài: "${q.evidence}"` : '',
    q.options.map((_, i) => pick(i)).join('\n'),
    `Đáp án: ${pick(q.answer)}.`,
    chosen === undefined ? 'Người học chưa chọn.' : `Người học chọn: ${pick(chosen)}.`,
    `Giải thích: ${q.explanationVi}`,
  ].filter(Boolean).join('\n').slice(0, TURN_MAX)
}
