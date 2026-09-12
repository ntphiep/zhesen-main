import type { SupabaseClient } from '@supabase/supabase-js'
import type { DictEntryDetail, DictSense, DictExample, DictRelation, CrossLangSibling, CharInfo, WordForm } from './types'
import { entryDetailRow, crossLanguageSourceRow, crossLangSiblingRow, pivotViRow, inflectionRow, charRow, toPreview, toSenses, toProns } from './rows'
import { fillPivotVi, cleanMtGloss } from './textQuality'
import { entryPivots, cleanGlossTerm } from './crosslang'

/** Everything the entry detail page needs beyond the search-result preview:
 * senses/pronunciations/examples/relations for one entry, its cross-language
 * siblings, its inflected forms, and the character info for any Han glyphs in
 * its headword. */

export async function getEntryDetail(supabase: SupabaseClient, entryId: string): Promise<DictEntryDetail | null> {
  const { data, error } = await supabase
    .schema('lex')
    .from('entries')
    .select('id, lang, headword, traditional, level, frequency_rank, attributes, senses(pos, gloss_vi, gloss_en, sense_order), pronunciations(accent, ipa, audio_url), examples!examples_entry_id_fkey(text, reading, translation_vi, translation_en), lex_relations!lex_relations_entry_id_fkey(relation_type, related_text, related_entry_id)')
    .eq('id', entryId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const r = entryDetailRow.parse(data)
  const preview = toPreview(r)
  const examples: DictExample[] = (r.examples ?? []).map((e) => ({
    text: e.text, reading: e.reading, translationVi: e.translation_vi, translationEn: e.translation_en,
  }))
  const relations: DictRelation[] = (r.lex_relations ?? []).map((x) => ({
    relationType: x.relation_type, relatedText: x.related_text, relatedEntryId: x.related_entry_id,
  }))
  let senses = toSenses(r.senses)
  // zh/es entries mostly lack a Vietnamese gloss; derive one via the English pivot.
  if (r.lang !== 'en') senses = await withPivotVi(supabase, senses)
  return {
    ...preview,
    senses,
    pronunciations: toProns(r.pronunciations),
    examples, relations,
    attributes: r.attributes ?? {},
  }
}

/** Fetch the Vietnamese glosses of the English pivot words for senses missing one,
 * and attach them as `pivotVi` (see fillPivotVi). */
async function withPivotVi(supabase: SupabaseClient, senses: DictSense[]): Promise<DictSense[]> {
  const terms = [...new Set(
    senses.filter((s) => !s.glossVi && s.glossEn).map((s) => cleanGlossTerm(s.glossEn)).filter((t): t is string => Boolean(t)),
  )]
  if (terms.length === 0) return senses
  const { data, error } = await supabase.schema('lex').from('entries')
    .select('headword_normalized, senses(gloss_vi, sense_order)').eq('lang', 'en').in('headword_normalized', terms)
  if (error) throw error
  const viByTerm = new Map<string, string>()
  for (const row of pivotViRow.array().parse(data ?? [])) {
    const vi = [...(row.senses ?? [])].sort((a, b) => a.sense_order - b.sense_order)
      .map((x) => cleanMtGloss(x.gloss_vi)).find((x): x is string => Boolean(x))
    if (vi) viByTerm.set(row.headword_normalized, vi)
  }
  return fillPivotVi(senses, viByTerm)
}

/**
 * Equivalents of an entry in the other languages, bridged through an English
 * pivot (see crosslang.ts). Pivot terms are computed here; the actual match runs
 * in the `lex.match_cross_language` SQL function so it is not subject to the
 * PostgREST row cap (the old "fetch all zh/es and filter in JS" approach silently
 * dropped most entries). Same-language matches are excluded -- this is the
 * "other languages" panel, not a synonyms list.
 */
export async function getCrossLanguage(
  supabase: SupabaseClient, entryId: string,
): Promise<CrossLangSibling[]> {
  const src = await supabase.schema('lex').from('entries')
    .select('lang, headword_normalized, senses(gloss_en)').eq('id', entryId).maybeSingle()
  if (src.error) throw src.error
  if (!src.data) return []
  const row = crossLanguageSourceRow.parse(src.data)

  const pivots = entryPivots(row.lang, row.headword_normalized ?? '', (row.senses ?? []).map((s) => s.gloss_en))
  if (pivots.length === 0) return []

  const { data, error } = await supabase.schema('lex').rpc('match_cross_language', {
    p_terms: pivots, p_exclude_lang: row.lang, p_exclude_id: entryId,
  })
  if (error) throw error
  return crossLangSiblingRow.array().parse(data ?? []).map((r) => ({
    id: r.id, lang: r.lang, headword: r.headword, glossVi: r.gloss_vi, glossEn: r.gloss_en,
  }))
}

/** Inflected forms of an entry (the grammatical word family). */
export async function getInflections(supabase: SupabaseClient, entryId: string): Promise<WordForm[]> {
  const { data, error } = await supabase.schema('lex').from('inflections')
    .select('form_text, form_label').eq('entry_id', entryId)
  if (error) throw error
  return inflectionRow.array().parse(data ?? []).map((r) => ({ formText: r.form_text, formLabel: r.form_label }))
}

export async function getCharacters(
  supabase: SupabaseClient, headword: string,
): Promise<CharInfo[]> {
  const glyphs = [...headword].filter((c) => /\p{Script=Han}/u.test(c))
  if (glyphs.length === 0) return []
  const unique = [...new Set(glyphs)]
  const { data, error } = await supabase.schema('lex').from('characters')
    .select('char, radical, stroke_count, han_viet, pinyin, gloss').in('char', unique)
  if (error) throw error
  const byChar = new Map(charRow.array().parse(data ?? []).map((r) => [r.char, r]))
  return glyphs.map((c) => {
    const r = byChar.get(c)
    return {
      char: c,
      radical: r?.radical ?? null,
      strokeCount: r?.stroke_count ?? null,
      hanViet: r?.han_viet ?? [],
      pinyin: r?.pinyin ?? [],
      gloss: r?.gloss ?? null,
    }
  })
}
