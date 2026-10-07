// Original items written by Claude at the owner's request on 2026-10-07, following the ETS
// Listening and Reading format. None is taken from ETS or from any book.
import { z } from '@/lib/zod'
import { QUESTION_TYPES } from './score'
import test01 from './test01.json'

const question = z.object({
  number: z.number().int().min(101).max(200),
  /** Part 5: the sentence with `-------`. Part 6 gap items: "". */
  stem: z.string(),
  options: z.array(z.string().min(1)).length(4),
  answer: z.number().int().min(0).max(3),
  type: z.enum(QUESTION_TYPES),
  /** Copied character for character from a passage of the group, "" in Part 5. */
  evidence: z.string(),
  explanationVi: z.string().min(1),
  /** Part 5 only: the completed sentence in Vietnamese. */
  vi: z.string().optional(),
})

const group = z.object({
  id: z.string().min(1),
  part: z.union([z.literal(5), z.literal(6), z.literal(7)]),
  intro: z.string(),
  passages: z.array(z.object({ type: z.string(), text: z.string().min(1) })),
  questions: z.array(question).min(1),
})

export type ToeicQuestion = z.infer<typeof question>
export type ToeicGroup = z.infer<typeof group>
export type ToeicPart = ToeicGroup['part']

export interface ToeicTest {
  /** The URL segment: `/practice/toeic/<id>`. */
  id: string
  titleVi: string
  groups: ToeicGroup[]
  /** A hash of the content, so a cache keyed on it drops when an item is edited. */
  version: string
}

/** FNV-1a over the text, 8 hex digits: enough to tell one edit of a file from the next. */
function hash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** One line per test. A new test is its JSON beside this file plus one line here. */
const REGISTRY: { id: string; titleVi: string; data: unknown }[] = [
  { id: 'test01', titleVi: 'Đề 1', data: test01 },
]

/** Parsed once when the module loads, so a malformed file fails the build, not a learner. */
export const TOEIC_TESTS: readonly ToeicTest[] = REGISTRY.map(({ id, titleVi, data }) => {
  const groups = z.array(group).parse(data)
  return { id, titleVi, groups, version: hash(JSON.stringify(groups)) }
})

export function getToeicTest(id: string): ToeicTest | null {
  return TOEIC_TESTS.find((t) => t.id === id) ?? null
}
