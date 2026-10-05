import { z } from '@/lib/zod'
import type { DictEntryPreview, SuggestionPreview } from './types'

/** The wire format of `GET /dictionary/search`. The browser must parse this, not cast it:
 *  an error body, a 429 or a proxy's HTML page has to become an empty result, not a
 *  `SearchResponse` missing `entries` that throws on `entries[lang]` at first render. */

const langCode = z.enum(['zh', 'es', 'en'])

const entryPreview: z.ZodType<DictEntryPreview> = z.object({
  id: z.string(),
  lang: langCode,
  headword: z.string(),
  traditional: z.string().nullable(),
  level: z.string().nullable(),
  levelIsEstimated: z.literal(true).optional(),
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
  kind: z.enum(['headword', 'gloss_vi']),
})

const byLang = z.object({
  en: entryPreview.array(),
  es: entryPreview.array(),
  zh: entryPreview.array(),
})

const translatedHits = z.object({ text: z.string(), entries: entryPreview.array() })

export const searchResponse = z.object({
  /** Results of the one direction the caller asked for, grouped by language. For the
   *  Vietnamese direction that is the language of the answer, not of the query. */
  entries: byLang,
  /** Trigram "did you mean" candidates, populated only when `entries` is empty. */
  suggestions: suggestion.array(),
  /** What the query's machine translation found where `entries` is thin. Each language
   *  spelled out, because `z.record` over an enum requires every key in Zod 4. */
  translated: z.object({
    en: translatedHits.optional(),
    es: translatedHits.optional(),
    zh: translatedHits.optional(),
  }).optional(),
})

export type SearchResponse = z.infer<typeof searchResponse>

export const EMPTY_SEARCH_RESPONSE: SearchResponse = {
  entries: { en: [], es: [], zh: [] },
  suggestions: [],
}
