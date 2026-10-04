import { z } from '@/lib/zod'
import type { LangCode } from '@/lib/languages'
import { senseSections } from './wordPage'
import type { ContainingWord, DictEntryChip, DictEntryPreview, DictSense, DictPron, SuggestionPreview } from './types'
import { cleanMtGloss, cleanGlossVi } from './textQuality'
import { audioMatchesHeadword } from './pronunciation'
import { joinPos } from './pos'

/**
 * Zod schemas for every row shape read from PostgREST here, plus the mapping from those
 * snake_case rows to the camelCase types in `./types`. Nothing in `lib/dictionary/` may
 * cast a Supabase response with `as`: every row is `.parse()`d here first.
 */

const langCode = z.enum(['zh', 'es', 'en'])

export const senseRow = z.object({
  pos: z.string().nullable(),
  gloss_vi: z.string().nullable(),
  gloss_en: z.string().nullable(),
  sense_order: z.number(),
  sense_frequency: z.string().nullable().optional(),
  // Selected only by DETAIL_SELECT.
  id: z.string().optional(),
  gloss_vi_is_mt: z.boolean().optional(),
  gloss_vi_source: z.string().nullable().optional(),
})
export type SenseRow = z.infer<typeof senseRow>

export const pronRow = z.object({
  accent: z.string(),
  ipa: z.string().nullable(),
  audio_url: z.string().nullable(),
})
export type PronRow = z.infer<typeof pronRow>

/** An entry id alone, for a query that ranks ids before fetching the rows. */
export const entryIdRow = z.object({ id: z.string() })

/** The row behind `entries(...senses(...), pronunciations(...))` embeds: everything
 *  `toPreview` needs before it picks a primary sense and pronunciation. */
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
  learner_entries: z.object({
    status: z.string(),
    learner_senses: z.array(z.object({
      sense_order: z.number(), vi_terms: z.array(z.string()), en_definition: z.string().nullable(),
    })),
  }).nullable().optional(),
})
export type EntryPreviewRow = z.infer<typeof entryPreviewRow>

/** The row behind `CHIP_SELECT` (`./entrySelect`). */
export const entryChipRow = z.object({
  id: z.string(),
  headword: z.string(),
  senses: z.array(senseRow).nullable(),
  learner_entries: z.object({
    status: z.string(),
    learner_senses: z.array(z.object({ sense_order: z.number(), vi_terms: z.array(z.string()) })),
  }).nullable().optional(),
})
export type EntryChipRow = z.infer<typeof entryChipRow>

export const exampleRow = z.object({
  text: z.string(),
  reading: z.string().nullable(),
  translation_vi: z.string().nullable(),
  translation_en: z.string().nullable(),
  sense_id: z.string().nullable(),
  source_id: z.string().nullable().optional(),
})

export const relationRow = z.object({
  relation_type: z.string(),
  related_text: z.string().nullable(),
  related_entry_id: z.string().nullable(),
})

export const entryDetailRow = entryPreviewRow.extend({
  lex_relations: z.array(relationRow).nullable(),
})
export type EntryDetailRow = z.infer<typeof entryDetailRow>

/** Flat row from the `lex.search` RPC (supabase/migrations/0016_search.sql): the primary
 *  sense and preferred pronunciation are already picked in SQL, so nothing is nested. */
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

/** Row from the `lex.suggest` RPC (supabase/migrations/0018_reverse_lookup.sql): a
 *  trigram-nearest headword or Vietnamese gloss for a query with zero direct hits. */
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

/** Row from `lex.relation_senses` (supabase/migrations/0074_relation_senses.sql). */
export const relationSenseRow = z.object({
  related_text: z.string(),
  sense_order: z.number(),
  target_id: z.string(),
})

export const crossLanguageSourceRow = z.object({
  lang: langCode,
  headword_normalized: z.string().nullable(),
  senses: z.array(z.object({
    gloss_en: z.string().nullable(),
    gloss_vi: z.string().nullable(),
  })).nullable(),
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

/** The sense the word page's overview leads with: the top sense, by `rankSenses`, of the
 *  part of speech met first. Classifier notes are skipped, so an entry made only of them
 *  falls back to sense_order 1. */
export function pickPrimarySense(senses: DictSense[]): DictSense | null {
  return senseSections(senses)[0]?.senses[0] ?? [...senses].sort((a, b) => a.senseOrder - b.senseOrder)[0] ?? null
}

/** The first sense of a published AI learner layer, which the word page shows first. Its
 *  English definition goes with it, so a saved word's two meanings name one sense. */
function learnerLead(r: {
  learner_entries?: { status: string; learner_senses: { sense_order: number; vi_terms: string[]; en_definition?: string | null }[] } | null
}): { glossVi: string | null; glossEn: string | null } | null {
  const layer = r.learner_entries
  if (layer?.status !== 'published') return null
  const first = layer.learner_senses.find((s) => s.sense_order === 1)
  if (!first || first.vi_terms.length === 0) return null
  return { glossVi: cleanGlossVi(first.vi_terms.join(', ')), glossEn: first.en_definition ?? null }
}

/** `lex.senses.sense_frequency` holds "1" to "5"; anything else is unranked. */
export function parseSenseFrequency(raw: string | null | undefined): number | null {
  const t = raw?.trim() ?? ''
  return /^[1-5]$/.test(t) ? Number(t) : null
}

/** In sense_order: PostgREST returns embedded rows in heap order, which an update of a
 *  sense reshuffles, and the page description reads the first three as they come. */
export function toSenses(rows: SenseRow[] | null): DictSense[] {
  return [...(rows ?? [])].sort((a, b) => a.sense_order - b.sense_order).map((r) => ({
    pos: r.pos, glossVi: cleanGlossVi(cleanMtGloss(r.gloss_vi)), glossEn: r.gloss_en, senseOrder: r.sense_order,
    ...(r.id === undefined ? {} : { id: r.id }),
    ...(r.sense_frequency === undefined ? {} : { senseFrequency: parseSenseFrequency(r.sense_frequency) }),
    ...(r.gloss_vi_is_mt === undefined ? {} : { glossViIsMt: r.gloss_vi_is_mt }),
    ...(r.gloss_vi_source === undefined ? {} : { glossViSource: r.gloss_vi_source }),
  }))
}
export function toProns(rows: PronRow[] | null): DictPron[] {
  return (rows ?? []).map((r) => ({ accent: r.accent, ipa: r.ipa, audioUrl: r.audio_url }))
}

export function toPreview(r: EntryPreviewRow): DictEntryPreview {
  const senses = toSenses(r.senses)
  const prons = toProns(r.pronunciations)
  const primary = learnerLead(r) ?? pickPrimarySense(senses)
  return {
    id: r.id, lang: r.lang, headword: r.headword, traditional: r.traditional, level: r.level,
    ipa: pickIpa(prons, r.lang),
    // Every part of speech the entry has, not the primary sense's: see 0045.
    pos: joinPos(senses.map((s) => s.pos)),
    glossVi: primary?.glossVi ?? null,
    glossEn: primary?.glossEn ?? null,
    audioUrl: prons.find((p) => audioMatchesHeadword(p.audioUrl, r.headword))?.audioUrl ?? null,
    frequencyRank: r.frequency_rank ?? null,
  }
}

/** The gloss `toPreview` would pick, and nothing else a chip does not draw. */
export function toChip(r: EntryChipRow): DictEntryChip {
  return { id: r.id, headword: r.headword, glossVi: (learnerLead(r) ?? pickPrimarySense(toSenses(r.senses)))?.glossVi ?? null }
}

/** Same mapping as `toPreview`, for the flattened `lex.search` and `lex.search_vi` rows,
 *  which share one shape (0016_search.sql, 0018_reverse_lookup.sql). */
export function toPreviewFromSearchRow(r: SearchRpcRow): DictEntryPreview {
  return {
    id: r.id, lang: r.lang, headword: r.headword, traditional: r.traditional, level: r.level,
    ipa: r.ipa, pos: r.pos, glossVi: cleanGlossVi(r.gloss_vi), glossEn: r.gloss_en,
    audioUrl: audioMatchesHeadword(r.audio_url, r.headword) ? r.audio_url : null,
    // `lex.entries.attributes->>'pinyin'` covers every Chinese entry including multi-syllable
    // ones; `lex.characters.pinyin` holds single characters only.
    reading: typeof r.attributes?.pinyin === 'string' ? r.attributes.pinyin : null,
    frequencyRank: r.frequency_rank ?? null,
    matchScore: r.rank,
  }
}

export function toSuggestion(r: SuggestRow): SuggestionPreview {
  return { id: r.id, lang: r.lang, headword: r.headword, glossVi: cleanGlossVi(r.gloss_vi), kind: r.kind }
}

/** Row from the `lex.entries_containing` RPC
 *  (supabase/migrations/0025_entries_containing.sql). */
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
    level: r.level, glossVi: cleanGlossVi(r.gloss_vi), glossEn: r.gloss_en,
  }
}
