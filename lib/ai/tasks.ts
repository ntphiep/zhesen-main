import { z } from '@/lib/zod'
import { isLangCode, type LangCode } from '@/lib/languages'
import { LANG_LABELS } from '@/lib/dictionary/labels'

/**
 * The assistant's whole surface: one task per row, each a schema in and out. Both
 * directions must stay Zod-checked -- the input arrives from a browser, the output
 * from a model.
 */

/** Trim and cap free text arriving from the browser; a wordlist word is short. */
const shortText = z.string().trim().min(1).max(120)
const langCode = z.string().refine(isLangCode, 'unsupported language code').transform((v) => v as LangCode)

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
  // Deduped here rather than at the render: the lists are keyed by their own text, so a
  // repeat is both a duplicate React key and a duplicate on screen.
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

// ---------------------------------------------------------------- suggest

export const suggestInput = z.object({
  /** What the learner typed and the dictionary could not match. */
  query: z.string().trim().min(1).max(120),
  /** The box it was typed in: 'vi' is Vietnamese looking for a word, 'fw' a foreign word. */
  direction: z.enum(['vi', 'fw']).optional(),
  /** The languages that box is set to; the answer stays inside them. */
  targets: z.array(langCode).min(1).max(3).optional(),
})

export const suggestOutput = z.object({
  words: z.array(z.object({
    lang: langCode,
    headword: z.string().max(80),
    meaningVi: z.string().max(200),
  })).max(6).transform((xs) => uniqueBy(xs, (w) => `${w.lang}:${w.headword}`)),
})

export type SuggestOutput = z.infer<typeof suggestOutput>

// ---------------------------------------------------------------- tags

/** A tag is a filter chip, so it has to be short enough to read in a row of
 *  them and repeated across words to be worth anything. */
const tagText = z.string().trim().min(1).max(24)

export const tagsInput = z.object({
  words: z.array(z.object({
    headword: shortText,
    meaningVi: z.string().trim().max(300).nullable(),
  })).min(1).max(40),
  /** Tags already in use, so the model reuses them instead of inventing a
   *  synonym for a category the learner already has. */
  existing: z.array(tagText).max(40).default([]),
})

export const tagsOutput = z.object({
  /** One entry per word, in the order they were sent. */
  tags: z.array(z.object({
    headword: z.string().max(120),
    tags: z.array(tagText).max(3).transform(unique),
  })).max(40),
})

export type TagsOutput = z.infer<typeof tagsOutput>

// ---------------------------------------------------------------- chat

/** The longest reply, and so the longest turn: every reply goes back as history. */
const REPLY_MAX = 1500

/** One turn of the conversation. Long enough for a paragraph the learner pasted
 *  in, short enough that a dozen of them stay inside the model's budget. */
const chatTurn = z.object({
  role: z.enum(['user', 'assistant']),
  text: z.string().trim().min(1).max(REPLY_MAX),
})

export const chatInput = z.object({
  /** What the learner is looking at, in one line. Without it "từ này nghĩa gì"
   *  has no referent and the assistant has to ask which word. */
  context: z.string().trim().max(300).default(''),
  /** The exchange so far, oldest first; the last turn is the new question. The
   *  cap is the reason the panel trims: an unbounded history is an unbounded bill. */
  messages: z.array(chatTurn).min(1).max(12),
})

export const chatOutput = z.object({
  reply: z.string().min(1).max(REPLY_MAX),
})

export type ChatOutput = z.infer<typeof chatOutput>

// ---------------------------------------------------------------- registry

const JSON_ONLY = 'Bạn trả về DUY NHẤT một object JSON hợp lệ. Không markdown, không rào đón, không giải thích ngoài JSON.'

const TEACHER = [
  'Bạn là giáo viên ngoại ngữ dạy người Việt, đang soạn thẻ từ vựng cho học viên.',
  'Mọi phần giải thích viết bằng tiếng Việt tự nhiên, ngắn gọn, đúng chính tả.',
  'Không bịa: không chắc thì để chuỗi rỗng hoặc mảng rỗng thay vì đoán.',
  JSON_ONLY,
].join(' ')

const TUTOR = [
  'Bạn là gia sư ngoại ngữ của một người Việt học tiếng Anh, tiếng Trung hoặc tiếng Tây Ban Nha, đang trả lời ngay trong ứng dụng từ điển Zhesen.',
  'Trả lời bằng tiếng Việt, ngắn gọn, đi thẳng vào câu hỏi, tối đa vài câu.',
  'Ví dụ thì viết nguyên văn ở ngôn ngữ đích rồi kèm bản dịch tiếng Việt.',
  'Không bịa: không chắc thì nói thẳng là không chắc.',
  'Chỉ trả lời chuyện học ngoại ngữ và cách dùng ứng dụng; câu hỏi ngoài phạm vi thì từ chối ngắn gọn.',
  'Viết văn bản thường, không markdown.',
].join(' ')

const ALL_LANGS: LangCode[] = ['en', 'zh', 'es']
const langNames = (langs: LangCode[]) => langs.map((l) => LANG_LABELS[l].toLowerCase()).join(', ')

/** The exam a learner of this language prepares for, as one prompt line. Only English
 *  learners here aim at TOEIC; Chinese and Spanish ones were coached with office English. */
function examLine(lang: LangCode): string {
  return lang === 'en' ? 'Học viên ôn thi TOEIC, nên ví dụ ưu tiên ngữ cảnh công sở và thương mại.' : ''
}

export interface TaskSpec<I, O> {
  input: z.ZodType<I>
  output: z.ZodType<O>
  maxTokens: number
  system: string
  prompt: (input: I) => string
  /** What the shape cannot say: checks the answer against the input it answers, and
   *  returns it trimmed to what holds, or null to refuse it whole. */
  check?: (output: O, input: I) => O | null
  /** Present when the model answers in plain text rather than JSON, which is what lets
   *  the route stream it; turns the whole text into what `output` checks. */
  fromText?: (text: string) => unknown
  /** With `fromText`: the longest text `output` accepts. The route stops the stream there. */
  maxChars?: number
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
        examLine(lang),
      ].filter(Boolean).join('\n'),
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
        ' "examples": mảng 2 phần tử {"text": câu ví dụ chứa đúng từ này, "vi": bản dịch tiếng Việt của câu đó};',
        ' "confusables": mảng tối đa 3 phần tử {"word": từ dễ nhầm, "note": khác nhau chỗ nào}}',
        examLine(lang),
      ].filter(Boolean).join('\n'),
  } satisfies TaskSpec<z.infer<typeof coachInput>, CoachOutput>,

  /** The way out of an empty search: the dictionary matches text, so a learner who knows
   *  the meaning but not the word has nothing to match on. Not dictionary data -- every
   *  suggestion must reach the page labelled as generated. */
  suggest: {
    input: suggestInput,
    output: suggestOutput,
    maxTokens: 700,
    system: TEACHER,
    prompt: ({ query, direction, targets = ALL_LANGS }) =>
      [
        direction === 'vi'
          ? `Người học gõ "${query}" vào ô tra tiếng Việt và không có kết quả nào. Đó có thể là một mô tả hoặc một từ viết sai.`
          : direction === 'fw'
            ? `Người học gõ "${query}" vào ô tra từ ${langNames(targets)} và không có kết quả nào. Đó có thể là một từ viết sai hoặc một dạng biến đổi.`
            : `Người học gõ "${query}" vào ô dịch và không có kết quả nào. Đó có thể là tiếng Việt, một mô tả, hoặc một từ viết sai.`,
        `Đề xuất tối đa 6 từ sát nghĩa nhất, chỉ bằng ${langNames(targets)}.`,
        'Trả JSON với đúng khoá sau:',
        `{"words": mảng các phần tử {"lang": ${targets.map((l) => `"${l}"`).join(' hoặc ')},`,
        '   "headword": chính từ đó, viết đúng chính tả, không kèm giải thích;',
        '   "meaningVi": nghĩa tiếng Việt ngắn gọn}}',
        'Không có từ nào phù hợp thì trả mảng rỗng.',
      ].join('\n'),
    check: (out, { targets }) => (targets ? { words: out.words.filter((w) => targets.includes(w.lang)) } : out),
  } satisfies TaskSpec<z.infer<typeof suggestInput>, SuggestOutput>,

  /** Topic tags for words already saved, so the wordlist's tag filter has something to
   *  filter by. Tags already in use go in the prompt so the model reuses "văn phòng"
   *  instead of coining "công sở" beside it. */
  tags: {
    input: tagsInput,
    output: tagsOutput,
    maxTokens: 1200,
    system: TEACHER,
    prompt: ({ words, existing }) =>
      [
        'Gắn thẻ chủ đề cho danh sách từ dưới đây.',
        existing.length ? `Thẻ đang dùng, hãy ưu tiên dùng lại: ${existing.join(', ')}.` : '',
        'Mỗi từ tối đa 2 thẻ, mỗi thẻ là một danh từ tiếng Việt ngắn, viết thường.',
        'Thẻ phải nói về chủ đề hoặc tình huống, không phải từ loại.',
        'Danh sách từ:',
        ...words.map((w, i) => `${i + 1}. ${w.headword}${w.meaningVi ? ` — ${w.meaningVi}` : ''}`),
        'Trả JSON với đúng khoá sau:',
        '{"tags": mảng {"headword": đúng từ đã cho, "tags": mảng thẻ}}',
        'Giữ nguyên thứ tự và chính tả của headword như trên.',
      ].filter(Boolean).join('\n'),
  } satisfies TaskSpec<z.infer<typeof tagsInput>, TagsOutput>,

  /** The assistant as a conversation, reachable from every page. The current page goes in
   *  as one line of context so a pronoun in the question resolves; history stays capped
   *  because every turn is re-sent and re-charged. */
  chat: {
    input: chatInput,
    output: chatOutput,
    maxTokens: 900,
    system: TUTOR,
    prompt: ({ context, messages }) =>
      [
        context ? `Người học đang xem: ${context}.` : '',
        'Đoạn hội thoại, lượt cuối là câu hỏi cần trả lời:',
        ...messages.map((m) => `${m.role === 'user' ? 'Người học' : 'Gia sư'}: ${m.text}`),
        'Viết câu trả lời của gia sư cho lượt cuối.',
      ].filter(Boolean).join('\n'),
    fromText: (text) => ({ reply: text.trim() }),
    maxChars: REPLY_MAX,
  } satisfies TaskSpec<z.infer<typeof chatInput>, ChatOutput>,
} as const

export type TaskName = keyof typeof TASKS

export function isTaskName(v: unknown): v is TaskName {
  return typeof v === 'string' && Object.hasOwn(TASKS, v)
}

/** The registry with its types erased, which is what the API route needs: a union of
 *  `TaskSpec`s validates nothing, because the compiler cannot pair one entry's input
 *  schema with the same entry's prompt. Narrowing here keeps the route free of casts. */
export interface ErasedTask {
  system: string
  maxTokens: number
  /** The prompt for this input, or null when the input is not acceptable. */
  promptFor(input: unknown): string | null
  /** The model's answer, or null when it is not the promised shape. */
  parseOutput(value: unknown): unknown | null
  /** `parseOutput` plus the task's `check` against this input. */
  parserFor(input: unknown): (value: unknown) => unknown | null
  /** See `TaskSpec.fromText`. */
  fromText?: (text: string) => unknown
  /** See `TaskSpec.maxChars`. */
  maxChars?: number
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
    parserFor(input) {
      const asked = spec.input.safeParse(input)
      return (value) => {
        const parsed = spec.output.safeParse(value)
        if (!parsed.success) return null
        return asked.success && spec.check ? spec.check(parsed.data, asked.data) : parsed.data
      }
    },
    fromText: spec.fromText,
    maxChars: spec.maxChars,
  }
}

/** Written out per task on purpose: `erase(TASKS[name])` would be handed the same
 *  union the route cannot use. Adding a task adds one line here. */
export const ERASED_TASKS: Record<TaskName, ErasedTask> = {
  enrich: erase(TASKS.enrich),
  coach: erase(TASKS.coach),
  suggest: erase(TASKS.suggest),
  tags: erase(TASKS.tags),
  chat: erase(TASKS.chat),
}
