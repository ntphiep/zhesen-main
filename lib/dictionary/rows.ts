import { z } from 'zod'
import type { LangCode } from '@/lib/languages'
import type { ContainingWord, DictEntryPreview, DictSense, DictPron, SuggestionPreview } from './types'
import { cleanMtGloss } from './textQuality'
import { audioMatchesHeadword } from './pronunciation'

/**
 * Zod schemas for every row shape read from Supabase/PostgREST in this feature,
 * plus the pure mapping from those (snake_case, possibly nested) rows to the
 * camelCase domain types in `./types`. Per AGENTS.md rule 3, nothing in
 * `lib/dictionary/` casts a Supabase response with `as` -- every row is
 * `.parse()`d here first, mirroring the pattern in `lib/wordlist/types.ts`
 * (`userWordRow`).
 */

const langCode = z.enum(['zh', 'es', 'en'])

export const senseRow = z.object({
  pos: z.string().nullable(),
  gloss_vi: z.string().nullable(),
  gloss_en: z.string().nullable(),
  sense_order: z.number(),
})
export type SenseRow = z.infer<typeof senseRow>

export const pronRow = z.object({
  accent: z.string(),
  ipa: z.string().nullable(),
  audio_url: z.string().nullable(),
})
export type PronRow = z.infer<typeof pronRow>

/** The row shape behind `entries(...senses(...), pronunciations(...))` PostgREST
 * embeds, i.e. everything `toPreview` needs before it picks a primary sense/pron. */
export const entryPreviewRow = z.object({
  id: z.string(),
  lang: langCode,
  headword: z.string(),
  traditional: z.string().nullable(),
  level: z.string().nullable(),
  frequency_rank: z.number().nullable(),
  attributes: z.record(z.string(), z.unknown()).nullable(),
  senses: z.array(senseRow).nullable(),
  pronunciations: z.array(pronRow).nullable(),
})
export type EntryPreviewRow = z.infer<typeof entryPreviewRow>

export const exampleRow = z.object({
  text: z.string(),
  reading: z.string().nullable(),
  translation_vi: z.string().nullable(),
  translation_en: z.string().nullable(),
})

export const relationRow = z.object({
  relation_type: z.string(),
  related_text: z.string().nullable(),
  related_entry_id: z.string().nullable(),
})

export const entryDetailRow = entryPreviewRow.extend({
  examples: z.array(exampleRow).nullable(),
  lex_relations: z.array(relationRow).nullable(),
})
export type EntryDetailRow = z.infer<typeof entryDetailRow>

/** Flat row returned by the `lex.search` RPC (see supabase/migrations/0016_search.sql):
 * unlike `entryPreviewRow`, the primary sense and preferred pronunciation are
 * already picked in SQL, so there is no nested senses()/pronunciations() to reduce. */
export const searchRpcRow = z.object({
  id: z.string(),
  lang: langCode,
  headword: z.string(),
  traditional: z.string().nullable(),
  level: z.string().nullable(),
  frequency_rank: z.number().nullable(),
  attributes: z.record(z.string(), z.unknown()).nullable(),
  pos: z.string().nullable(),
  gloss_vi: z.string().nullable(),
  gloss_en: z.string().nullable(),
  ipa: z.string().nullable(),
  audio_url: z.string().nullable(),
  rank: z.number(),
})
export type SearchRpcRow = z.infer<typeof searchRpcRow>

/** Row returned by the `lex.suggest` RPC (see supabase/migrations/0018_reverse_lookup.sql):
 * a trigram-nearest headword or Vietnamese gloss for a query with zero direct hits. */
export const suggestRow = z.object({
  id: z.string(),
  lang: langCode,
  headword: z.string(),
  gloss_vi: z.string().nullable(),
  kind: z.enum(['headword', 'gloss_vi']),
  score: z.number(),
})
export type SuggestRow = z.infer<typeof suggestRow>

export const crossLangSiblingRow = z.object({
  id: z.string(),
  lang: langCode,
  headword: z.string(),
  reading: z.string().nullable(),
  gender: z.string().nullable(),
  pos: z.string().nullable(),
  gloss_vi: z.string().nullable(),
  gloss_en: z.string().nullable(),
})

export const termPreviewRow = z.object({
  match_text: z.string(),
  id: z.string(),
  headword: z.string(),
  pos: z.string().nullable(),
  ipa: z.string().nullable(),
  reading: z.string().nullable(),
  gender: z.string().nullable(),
  gloss_vi: z.string().nullable(),
  gloss_en: z.string().nullable(),
})

export const crossLanguageSourceRow = z.object({
  lang: langCode,
  headword_normalized: z.string().nullable(),
  senses: z.array(z.object({ gloss_en: z.string().nullable() })).nullable(),
})

export const pivotViRow = z.object({
  headword_normalized: z.string(),
  senses: z.array(z.object({ gloss_vi: z.string().nullable(), sense_order: z.number() })).nullable(),
})

export const inflectionRow = z.object({
  form_text: z.string(),
  form_label: z.string().nullable(),
})

export const inflectionEntryLookupRow = z.object({
  form_text: z.string(),
  entry_id: z.string(),
})

export const charRow = z.object({
  char: z.string(),
  radical: z.string().nullable(),
  stroke_count: z.number().nullable(),
  han_viet: z.array(z.string()).nullable(),
  pinyin: z.array(z.string()).nullable(),
  gloss: z.string().nullable(),
})

export const headwordRow = z.object({ headword: z.string() })

export function pickIpa(prons: { accent: string; ipa: string | null }[], lang: LangCode): string | null {
  if (prons.length === 0) return null
  const byAccent = (needle: string) => prons.find((p) => p.accent.toLowerCase().includes(needle) && p.ipa)?.ipa ?? null
  if (lang === 'en') return byAccent('us') ?? byAccent('uk') ?? prons.find((p) => p.ipa)?.ipa ?? null
  return prons.find((p) => p.ipa)?.ipa ?? null
}

export function pickPrimarySense(senses: DictSense[]): DictSense | null {
  if (senses.length === 0) return null
  return [...senses].sort((a, b) => a.senseOrder - b.senseOrder)[0]
}

export function toSenses(rows: SenseRow[] | null): DictSense[] {
  return (rows ?? []).map((r) => ({ pos: r.pos, glossVi: cleanMtGloss(r.gloss_vi), glossEn: r.gloss_en, senseOrder: r.sense_order }))
}
export function toProns(rows: PronRow[] | null): DictPron[] {
  return (rows ?? []).map((r) => ({ accent: r.accent, ipa: r.ipa, audioUrl: r.audio_url }))
}

export function toPreview(r: EntryPreviewRow): DictEntryPreview {
  const senses = toSenses(r.senses)
  const prons = toProns(r.pronunciations)
  const primary = pickPrimarySense(senses)
  return {
    id: r.id, lang: r.lang, headword: r.headword, traditional: r.traditional, level: r.level,
    ipa: pickIpa(prons, r.lang),
    pos: primary?.pos ?? null,
    glossVi: primary?.glossVi ?? null,
    glossEn: primary?.glossEn ?? null,
    audioUrl: prons.find((p) => audioMatchesHeadword(p.audioUrl, r.headword))?.audioUrl ?? null,
    frequencyRank: r.frequency_rank ?? null,
  }
}

/** Same mapping as `toPreview`, for the already-flattened `lex.search`/`lex.search_vi`
 * RPC row (both share the same shape, see 0016_search.sql and 0018_reverse_lookup.sql). */
export function toPreviewFromSearchRow(r: SearchRpcRow): DictEntryPreview {
  return {
    id: r.id, lang: r.lang, headword: r.headword, traditional: r.traditional, level: r.level,
    ipa: r.ipa, pos: r.pos, glossVi: r.gloss_vi, glossEn: r.gloss_en,
    audioUrl: audioMatchesHeadword(r.audio_url, r.headword) ? r.audio_url : null,
    frequencyRank: r.frequency_rank ?? null,
    matchScore: r.rank,
  }
}

export function toSuggestion(r: SuggestRow): SuggestionPreview {
  return { id: r.id, lang: r.lang, headword: r.headword, glossVi: r.gloss_vi }
}

/** Row returned by the `lex.entries_containing` RPC (see
 * supabase/migrations/0025_entries_containing.sql). */
export const containingRow = z.object({
  id: z.string(),
  lang: langCode,
  headword: z.string(),
  traditional: z.string().nullable(),
  level: z.string().nullable(),
  frequency_rank: z.number().nullable(),
  gloss_vi: z.string().nullable(),
  gloss_en: z.string().nullable(),
})
export type ContainingRow = z.infer<typeof containingRow>

export function toContaining(r: ContainingRow): ContainingWord {
  return {
    id: r.id, lang: r.lang, headword: r.headword, traditional: r.traditional,
    level: r.level, glossVi: r.gloss_vi, glossEn: r.gloss_en,
  }
}
