/** Question types a TOEIC Reading item is tagged with, and their names on the results page.
 *  No data import here: the runner bundles this module, the test JSON stays on the server. */
export const QUESTION_TYPES = [
  'word-form', 'verb-tense', 'vocabulary', 'preposition', 'conjunction', 'pronoun',
  'relative-clause', 'comparison', 'transition', 'sentence-insertion', 'purpose', 'detail',
  'inference', 'not-true', 'synonym', 'intended-meaning', 'cross-reference',
] as const

export type ToeicQuestionType = (typeof QUESTION_TYPES)[number]

export const TYPE_LABELS: Record<ToeicQuestionType, string> = {
  'word-form': 'Từ loại',
  'verb-tense': 'Thì và dạng động từ',
  vocabulary: 'Từ vựng',
  preposition: 'Giới từ',
  conjunction: 'Liên từ',
  pronoun: 'Đại từ',
  'relative-clause': 'Mệnh đề quan hệ',
  comparison: 'So sánh',
  transition: 'Từ nối',
  'sentence-insertion': 'Chèn câu',
  purpose: 'Mục đích',
  detail: 'Chi tiết',
  inference: 'Suy luận',
  'not-true': 'Câu NOT',
  synonym: 'Từ đồng nghĩa',
  'intended-meaning': 'Ý định người viết',
  'cross-reference': 'Đối chiếu nhiều văn bản',
}

/** Raw correct answers to a Reading score, the owner's anchor table. Not an ETS table. */
const ANCHORS: readonly [number, number][] = [
  [0, 5], [10, 25], [20, 70], [30, 120], [40, 175], [50, 230],
  [60, 285], [70, 340], [80, 390], [90, 445], [100, 495],
]

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** An unofficial Reading score range for `correct` of 100: linear between anchors, rounded
 *  to 5, then 25 either side within 5 to 495. */
export function estimateReading(correct: number): { low: number; high: number } {
  const raw = clamp(correct, 0, 100)
  const i = Math.max(0, ANCHORS.findIndex(([x]) => x >= raw) - 1)
  const [x0, y0] = ANCHORS[i]
  const [x1, y1] = ANCHORS[i + 1]
  const mid = Math.round((y0 + ((y1 - y0) * (raw - x0)) / (x1 - x0)) / 5) * 5
  return { low: clamp(mid - 25, 5, 495), high: clamp(mid + 25, 5, 495) }
}

export interface Tally { correct: number; total: number }

/** One graded item of a session. */
export interface Graded { part: number; type: ToeicQuestionType; correct: boolean }

/** Correct over total for the whole session, per part in test order, and per question type
 *  with the weakest first: lowest accuracy, then the type with more items. */
export function summarize(items: readonly Graded[]) {
  const add = <K>(m: Map<K, Tally>, k: K, ok: boolean) => {
    const t = m.get(k) ?? { correct: 0, total: 0 }
    m.set(k, { correct: t.correct + (ok ? 1 : 0), total: t.total + 1 })
  }
  const parts = new Map<number, Tally>()
  const types = new Map<ToeicQuestionType, Tally>()
  for (const g of items) {
    add(parts, g.part, g.correct)
    add(types, g.type, g.correct)
  }
  return {
    total: { correct: items.filter((g) => g.correct).length, total: items.length },
    parts: [...parts].sort(([a], [b]) => a - b).map(([part, t]) => ({ part, ...t })),
    types: [...types]
      .map(([type, t]) => ({ type, label: TYPE_LABELS[type], ...t }))
      .sort((a, b) => a.correct / a.total - b.correct / b.total || b.total - a.total),
  }
}
