import { z } from '@/lib/zod'
import type { LangCode } from '@/lib/languages'

/** Zod schemas for `lex.grammar_points` and `lex.grammar_examples` rows
 *  (supabase/migrations/0020_grammar_points.sql), plus the camelCase types. Nothing here
 *  may cast a Supabase response with `as`. */

const langCode = z.enum(['zh', 'es', 'en'])
const levelScheme = z.enum(['HSK', 'CEFR'])

export const grammarExampleRow = z.object({
  text: z.string(),
  reading: z.string().nullable(),
  translation_vi: z.string(),
  sort_order: z.number(),
})
export type GrammarExampleRow = z.infer<typeof grammarExampleRow>

export const grammarPointRow = z.object({
  id: z.string(),
  lang: langCode,
  level_scheme: levelScheme.nullable(),
  level: z.string().nullable(),
  category_vi: z.string().nullable(),
  title_vi: z.string(),
  pattern: z.string(),
  explanation_vi: z.string(),
  common_mistake_vi: z.string().nullable(),
  sort_order: z.number(),
})
export type GrammarPointRow = z.infer<typeof grammarPointRow>

export const grammarPointDetailRow = grammarPointRow.extend({
  grammar_examples: z.array(grammarExampleRow).nullable(),
})
export type GrammarPointDetailRow = z.infer<typeof grammarPointDetailRow>

export interface GrammarPoint {
  id: string
  lang: LangCode
  levelScheme: 'HSK' | 'CEFR' | null
  level: string | null
  categoryVi: string | null
  titleVi: string
  pattern: string
  sortOrder: number
}

export interface GrammarExample {
  text: string
  reading: string | null
  translationVi: string
}

export interface GrammarPointDetail extends GrammarPoint {
  explanationVi: string
  commonMistakeVi: string | null
  examples: GrammarExample[]
}

/** One level's worth of grammar points, for the `/grammar/[lang]` overview. */
export interface GrammarLevelGroup {
  level: string
  points: GrammarPoint[]
}

export function toGrammarPoint(r: GrammarPointRow): GrammarPoint {
  return {
    id: r.id, lang: r.lang, levelScheme: r.level_scheme, level: r.level,
    categoryVi: r.category_vi, titleVi: r.title_vi, pattern: r.pattern, sortOrder: r.sort_order,
  }
}

export function toGrammarPointDetail(r: GrammarPointDetailRow): GrammarPointDetail {
  const examples = [...(r.grammar_examples ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((e) => ({ text: e.text, reading: e.reading, translationVi: e.translation_vi }))
  return {
    ...toGrammarPoint(r),
    explanationVi: r.explanation_vi,
    commonMistakeVi: r.common_mistake_vi,
    examples,
  }
}
