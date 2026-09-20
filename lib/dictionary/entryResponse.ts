import { z } from '@/lib/zod'
import type { DictEntryDetail } from './types'

/** The wire format of `GET /dictionary/entry`. Parsed, not cast: a 429 body, an error
 *  page or a proxy's HTML must become "no detail", not an object that throws on
 *  `detail.senses.map` at first render. */

const langCode = z.enum(['zh', 'es', 'en'])

const sense = z.object({
  pos: z.string().nullable(),
  glossVi: z.string().nullable(),
  glossEn: z.string().nullable(),
  senseOrder: z.number(),
  pivotVi: z.string().nullable().optional(),
})

const pron = z.object({
  accent: z.string(),
  ipa: z.string().nullable(),
  audioUrl: z.string().nullable(),
})

const example = z.object({
  text: z.string(),
  reading: z.string().nullable(),
  translationVi: z.string().nullable(),
  translationEn: z.string().nullable(),
})

const relation = z.object({
  relationType: z.string(),
  relatedText: z.string().nullable(),
  relatedEntryId: z.string().nullable(),
})

export const entryDetailResponse: z.ZodType<DictEntryDetail> = z.object({
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
  reading: z.string().nullable().optional(),
  frequencyRank: z.number().nullable().optional(),
  matchScore: z.number().nullable().optional(),
  senses: sense.array(),
  pronunciations: pron.array(),
  examples: example.array(),
  relations: relation.array(),
  attributes: z.record(z.string(), z.unknown()),
})

export type EntryDetailOutcome =
  | { status: 'ok'; detail: DictEntryDetail | null }
  | { status: 'refused' }

/**
 * One entry, through the cached route rather than straight from the browser to Supabase.
 * The route holds `unstable_cache` and the CDN headers; a direct query pays the full
 * round trip to Seoul on every expand, which is what made the wordlist's "Xem" slow.
 */
export async function fetchEntryDetail(entryId: string, signal?: AbortSignal): Promise<EntryDetailOutcome> {
  const res = await fetch(`/dictionary/entry?id=${encodeURIComponent(entryId)}`, { signal })
  if (!res.ok) return { status: 'refused' }
  const body: unknown = await res.json()
  return { status: 'ok', detail: body === null ? null : entryDetailResponse.parse(body) }
}
