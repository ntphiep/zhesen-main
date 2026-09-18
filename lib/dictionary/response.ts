import { z } from '@/lib/zod'
import type { DictEntryPreview, SuggestionPreview } from './types'

/** The wire format of `GET /dictionary/search`. The browser must parse this, not cast it:
 *  an error body, a 429 or a proxy's HTML page has to become an empty result, not a
 *  `SearchResponse` missing `forward` that throws on `forward[lang]` at first render. */

const langCode = z.enum(['zh', 'es', 'en'])

const entryPreview: z.ZodType<DictEntryPreview> = z.object({
  id: z.string(),
  lang: langCode,
  headword: z.string(),
  traditional: z.string().nullable(),
  level: z.string().nullable(),
  ipa: z.string().nullable(),
  pos: z.string().nullable(),
  glossVi: z.string().nullable(),
  glossEn: z.string().nullable(),
  audioUrl: z.string().nullable(),
  frequencyRank: z.number().nullable().optional(),
  matchScore: z.number().nullable().optional(),
})

const suggestion: z.ZodType<SuggestionPreview> = z.object({
  id: z.string(),
  lang: langCode,
  headword: z.string(),
  glossVi: z.string().nullable(),
})

const byLang = z.object({
  en: entryPreview.array(),
  es: entryPreview.array(),
  zh: entryPreview.array(),
})

export const searchResponse = z.object({
  /** Direct search (query typed in en/es/zh). */
  forward: byLang,
  /** Reverse lookup (query typed in Vietnamese), grouped by the *target* language. */
  reverse: byLang,
  /** Trigram "did you mean" candidates, populated only when both of the above are empty. */
  suggestions: suggestion.array(),
})

export type SearchResponse = z.infer<typeof searchResponse>

export const EMPTY_SEARCH_RESPONSE: SearchResponse = {
  forward: { en: [], es: [], zh: [] },
  reverse: { en: [], es: [], zh: [] },
  suggestions: [],
}

/** Best `lex.search` score in a group, 0 when nothing carries one. Lives here so
 *  the route and the search box read one definition of the rule. */
export function bestScore(byLang: SearchResponse['forward']): number {
  return Math.max(0, ...[...byLang.en, ...byLang.es, ...byLang.zh].map((e) => e.matchScore ?? 0))
}
