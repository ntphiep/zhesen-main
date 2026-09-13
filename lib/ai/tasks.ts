import { z } from 'zod'
import { isLangCode, type LangCode } from '@/lib/languages'
import { LANG_LABELS } from '@/lib/dictionary/labels'

/**
 * The assistant's whole surface: two tasks, each a schema in and a schema out.
 *
 * Kept as a table rather than a route per task so the API route stays one
 * handler, and so a new task cannot be added without declaring what it accepts
 * and what it promises to return. Both directions are Zod-checked -- the input
 * because it arrives from a browser, the output because it arrives from a model.
 */

/** Trim and cap free text arriving from the browser; a wordlist word is short. */
const shortText = z.string().trim().min(1).max(120)
const langCode = z.string().refine(isLangCode, 'ngôn ngữ không hợp lệ').transform((v) => v as LangCode)

// ---------------------------------------------------------------- enrich

export const enrichInput = z.object({
  lang: langCode,
  headword: shortText,
})

export const enrichOutput = z.object({
  meaningVi: z.string().max(300),
  ipa: z.string().max(120),
  pos: z.string().max(60),
  level: z.string().max(10),
  example: z.string().max(400),
  exampleVi: z.string().max(400),
})

export type EnrichOutput = z.infer<typeof enrichOutput>

const unique = (xs: string[]): string[] => [...new Set(xs)]

function uniqueBy<T>(xs: T[], key: (x: T) => string): T[] {
  const seen = new Map<string, T>()
  for (const x of xs) if (!seen.has(key(x))) seen.set(key(x), x)
  return [...seen.values()]
}

// ---------------------------------------------------------------- coach

export const coachInput = z.object({
  lang: langCode,
  headword: shortText,
  meaningVi: z.string().trim().max(300).nullable(),
})

export const coachOutput = z.object({
  /** A memory hook in Vietnamese: word shape, root, or a picture to hold on to. */
  mnemonic: z.string().max(400),
  // Deduped here rather than at the render: a model repeating itself is ordinary,
  // and the lists are keyed by their own text, so a repeat is both a duplicate
  // React key and a duplicate on screen.
  /** Words this one habitually travels with, as the learner will meet them. */
  collocations: z.array(z.string().max(80)).max(6).transform(unique),
  /** Two sentences in the word's own language, each with its Vietnamese. */
  examples: z.array(z.object({ text: z.string().max(300), vi: z.string().max(300) })).max(3)
    .transform((xs) => uniqueBy(xs, (e) => e.text)),
  /** Words that are easy to mistake for this one, and the difference. */
  confusables: z.array(z.object({ word: z.string().max(80), note: z.string().max(240) })).max(3)
    .transform((xs) => uniqueBy(xs, (c) => c.word)),
})

export type CoachOutput = z.infer<typeof coachOutput>

// ---------------------------------------------------------------- registry

const JSON_ONLY = 'Bạn trả về DUY NHẤT một object JSON hợp lệ. Không markdown, không rào đón, không giải thích ngoài JSON.'

const TEACHER = [
  'Bạn là giáo viên ngoại ngữ dạy người Việt, đang soạn thẻ từ vựng cho học viên ôn thi TOEIC.',
  'Mọi phần giải thích viết bằng tiếng Việt tự nhiên, ngắn gọn, đúng chính tả.',
  'Không bịa: không chắc thì để chuỗi rỗng hoặc mảng rỗng thay vì đoán.',
  JSON_ONLY,
].join(' ')

export interface TaskSpec<I, O> {
  input: z.ZodType<I>
  output: z.ZodType<O>
  maxTokens: number
  system: string
  prompt: (input: I) => string
}

export const TASKS = {
  enrich: {
    input: enrichInput,
    output: enrichOutput,
    maxTokens: 700,
    system: TEACHER,
    prompt: ({ lang, headword }) =>
      [
        `Từ cần soạn thẻ: "${headword}" (${LANG_LABELS[lang]}).`,
        'Trả JSON với đúng các khoá sau:',
        '{"meaningVi": nghĩa tiếng Việt, gộp tối đa 3 nghĩa phổ biến, ngăn bằng dấu phẩy;',
        ' "ipa": phiên âm (tiếng Trung thì ghi pinyin có dấu thanh), không kèm dấu gạch chéo;',
        ' "pos": từ loại bằng tiếng Anh viết thường, ví dụ noun, verb, adjective;',
        ' "level": bậc CEFR ước lượng, một trong A1 A2 B1 B2 C1 C2;',
        ' "example": một câu ví dụ tự nhiên chứa đúng từ này, độ dài vừa phải;',
        ' "exampleVi": bản dịch tiếng Việt của chính câu ví dụ đó, KHÔNG phải nghĩa của từ}',
      ].join('\n'),
  } satisfies TaskSpec<z.infer<typeof enrichInput>, EnrichOutput>,

  coach: {
    input: coachInput,
    output: coachOutput,
    maxTokens: 1100,
    system: TEACHER,
    prompt: ({ lang, headword, meaningVi }) =>
      [
        `Từ: "${headword}" (${LANG_LABELS[lang]}).`,
        meaningVi ? `Nghĩa học viên đã lưu: "${meaningVi}". Bám theo nghĩa này.` : '',
        'Trả JSON với đúng các khoá sau:',
        '{"mnemonic": một mẹo nhớ ngắn bằng tiếng Việt, dựa vào gốc từ, hình ảnh hoặc âm thanh;',
        ' "collocations": mảng tối đa 6 cụm từ hay đi kèm, viết nguyên cụm;',
        ' "examples": mảng 2 phần tử {"text": câu ví dụ, "vi": bản dịch tiếng Việt của câu đó},',
        '   ưu tiên ngữ cảnh công sở và thương mại vì học viên ôn TOEIC;',
        ' "confusables": mảng tối đa 3 phần tử {"word": từ dễ nhầm, "note": khác nhau chỗ nào}}',
      ].filter(Boolean).join('\n'),
  } satisfies TaskSpec<z.infer<typeof coachInput>, CoachOutput>,
} as const

export type TaskName = keyof typeof TASKS

export function isTaskName(v: unknown): v is TaskName {
  return typeof v === 'string' && Object.hasOwn(TASKS, v)
}

/**
 * The registry with its types erased, which is what the API route needs.
 *
 * A route that looks a task up by name sees a union of `TaskSpec`s, and a union
 * of schemas cannot validate anything: the compiler has no way to pair the input
 * schema of one entry with the prompt of the same entry. Narrowing once here,
 * where each entry is written out with its concrete types, keeps the route free
 * of casts.
 */
export interface ErasedTask {
  system: string
  maxTokens: number
  /** The prompt for this input, or null when the input is not acceptable. */
  promptFor(input: unknown): string | null
  /** The model's answer, or null when it is not the promised shape. */
  parseOutput(value: unknown): unknown | null
}

function erase<I, O>(spec: TaskSpec<I, O>): ErasedTask {
  return {
    system: spec.system,
    maxTokens: spec.maxTokens,
    promptFor(input) {
      const parsed = spec.input.safeParse(input)
      return parsed.success ? spec.prompt(parsed.data) : null
    },
    parseOutput(value) {
      const parsed = spec.output.safeParse(value)
      return parsed.success ? parsed.data : null
    },
  }
}

/** Written out per task on purpose: `erase(TASKS[name])` would be handed the same
 *  union the route cannot use. Adding a task adds one line here. */
export const ERASED_TASKS: Record<TaskName, ErasedTask> = {
  enrich: erase(TASKS.enrich),
  coach: erase(TASKS.coach),
}
