import type { SupabaseClient } from '@supabase/supabase-js'
import type { DictEntryDetail, DictEntryPreview, DictSense, DictExample, DictRelation, CrossLangSibling, TermPreview, WordForm, SenseLink } from './types'
import { entryDetailRow, exampleRow, crossLanguageSourceRow, crossLangSiblingRow, termPreviewRow, pivotViRow, inflectionRow, relationSenseRow, toPreview, toSenses, toProns } from './rows'
import { fillPivotVi, cleanMtGloss, cleanGlossVi } from './textQuality'
import { entryPivots, cleanGlossTerm } from './crosslang'
import { DETAIL_SELECT } from './entrySelect'
import { searchAllLanguagesVi } from './search'
import { LANG_CODES, type LangCode } from '@/lib/languages'
import { isOpenLicence } from './licence'

/** Everything the entry detail page needs beyond the preview: senses, pronunciations,
 *  examples, relations, cross-language siblings, inflections and Han character info. */

/** Rows read per entry. Every sense-linked row must fit, because they sort by the text
 *  of sense_id and a cut would drop `#2` before `#10`: the most any entry has is 204
 *  (`en:take`, 92 senses), measured on production.
 *  ponytail: fixed cap, move the per-sense cut into SQL if an import passes it. */
export const MAX_FETCHED_EXAMPLES = 300
/** Kept per sense: the page shows one and prefers the one with a real translation. */
export const EXAMPLES_PER_SENSE = 2
/** Kept without a sense, translated ones first. */
export const MAX_UNLINKED_EXAMPLES = 40

/** Linked rows capped per sense, then the unlinked ones, in the order they were read. */
export function capExamples<T extends { senseId?: string | null }>(rows: T[]): T[] {
  const perSense = new Map<string, number>()
  let unlinked = 0
  return rows.filter((e) => {
    if (!e.senseId) return ++unlinked <= MAX_UNLINKED_EXAMPLES
    const n = (perSense.get(e.senseId) ?? 0) + 1
    perSense.set(e.senseId, n)
    return n <= EXAMPLES_PER_SENSE
  })
}

/** Sense links in the order the relations were read, which is their rank: relation_senses
 *  groups by text, so big's first sense listed chunky and fat ahead of great and large. */
export function byRelationOrder(links: SenseLink[], relations: DictRelation[]): SenseLink[] {
  const at = new Map<string, number>()
  relations.forEach((r, i) => {
    const k = r.relatedText?.toLowerCase()
    if (k && !at.has(k)) at.set(k, i)
  })
  const of = (l: SenseLink) => at.get(l.text.toLowerCase()) ?? relations.length
  return [...links].sort((a, b) => of(a) - of(b))
}

/** Which sense each synonym belongs to. A failure leaves the synonyms unsorted rather than
 *  failing the page: the call is an extra, and en:head alone carries 1,569 relations. */
async function getSenseLinks(supabase: SupabaseClient, entryId: string): Promise<SenseLink[]> {
  try {
    const { data, error } = await supabase.schema('lex').rpc('relation_senses', { p_entry_id: entryId })
    if (error) throw error
    return relationSenseRow.array().parse(data ?? []).map((r) => ({
      text: r.related_text, senseOrder: r.sense_order, targetId: r.target_id,
    }))
  } catch (e) {
    console.error('relation_senses failed', entryId, e)
    return []
  }
}

export async function getEntryDetail(supabase: SupabaseClient, entryId: string): Promise<DictEntryDetail | null> {
  // Examples are a query of their own, in parallel: sense-linked rows first, then rows
  // with a Vietnamese translation, then by id.
  const [entry, ex, senseLinks] = await Promise.all([
    supabase
      .schema('lex')
      .from('entries')
      .select(`${DETAIL_SELECT}, lex_relations!lex_relations_entry_id_fkey(relation_type, related_text, related_entry_id)`)
      .eq('id', entryId)
      // Synonyms and antonyms by rank (0197), WordNet's first; the rest in the order a loader
      // wrote them, so a word family is nearest member first.
      .order('rank', { referencedTable: 'lex_relations', nullsFirst: false })
      .order('id', { referencedTable: 'lex_relations' })
      .maybeSingle(),
    supabase
      .schema('lex')
      .from('examples')
      .select('text, reading, translation_vi, translation_en, sense_id, source_id, sources(license)')
      .eq('entry_id', entryId)
      .order('sense_id', { nullsFirst: false })
      .order('translation_vi', { nullsFirst: false })
      .order('id')
      .limit(MAX_FETCHED_EXAMPLES),
    getSenseLinks(supabase, entryId),
  ])
  if (entry.error) throw entry.error
  if (!entry.data) return null
  if (ex.error) throw ex.error
  const r = entryDetailRow.parse(entry.data)
  const preview = toPreview(r)
  // Only sources with an open licence (./licence). Filtered here rather than in PostgREST:
  // no entry holds more than 297 rows, so the cap above never spends a slot on one dropped.
  const shown = exampleRow.array().parse(ex.data ?? []).filter((e) => !e.sources || isOpenLicence(e.sources.license))
  const examples: DictExample[] = capExamples(shown.map((e) => ({
    text: e.text, reading: e.reading, translationVi: e.translation_vi, translationEn: e.translation_en, senseId: e.sense_id,
    sourceId: e.source_id ?? null,
  })))
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
    examples, relations, senseLinks: byRelationOrder(senseLinks, relations),
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
      .map((x) => cleanGlossVi(cleanMtGloss(x.gloss_vi))).find((x): x is string => Boolean(x))
    if (vi) viByTerm.set(row.headword_normalized, vi)
  }
  return fillPivotVi(senses, viByTerm)
}

/** Per language, not overall, so a word with many Spanish equivalents cannot
 *  push Chinese out of the panel entirely. */
const PER_LANGUAGE = 3

/** Equivalents of an entry in the other languages, bridged through an English pivot. The
 *  match runs in `lex.match_cross_language` so it escapes the PostgREST row cap.
 *  Same-language matches are excluded: this is the other-languages panel, not synonyms. */
export async function getCrossLanguage(
  supabase: SupabaseClient, entryId: string,
): Promise<CrossLangSibling[]> {
  const src = await supabase.schema('lex').from('entries')
    .select('lang, headword_normalized, senses(gloss_en, gloss_vi)').eq('id', entryId).maybeSingle()
  if (src.error) throw src.error
  if (!src.data) return []
  const row = crossLanguageSourceRow.parse(src.data)
  const senses = row.senses ?? []

  const pivots = entryPivots(row.lang, row.headword_normalized ?? '', senses.map((s) => s.gloss_en))
  const exact = pivots.length === 0 ? [] : await matchByPivot(supabase, pivots, row.lang, entryId)

  // The exact match needs a target's English gloss to equal the pivot whole, and glosses
  // are written as lists, so a pivot that is one list item misses: sampled on 22 English
  // entries, 9 had no row at all. The Vietnamese meaning is the second bridge, over the
  // same indexed path as the reverse lookup, and runs only where the exact match was empty.
  const glossVi = senses.map((s) => s.gloss_vi).find((g) => g && g.trim()) ?? null
  const short = LANG_CODES.filter((l) => l !== row.lang && !exact.some((e) => e.lang === l))
  if (!glossVi || short.length === 0) return exact

  const byVi = await searchAllLanguagesVi(supabase, glossVi, PER_LANGUAGE)
  const filled = short.flatMap((l) => byVi[l].filter((p) => p.id !== entryId).map(toSibling))
  return [...exact, ...filled].sort((a, b) => a.lang.localeCompare(b.lang))
}

async function matchByPivot(
  supabase: SupabaseClient, pivots: string[], lang: LangCode, entryId: string,
): Promise<CrossLangSibling[]> {
  const { data, error } = await supabase.schema('lex').rpc('match_cross_language', {
    p_terms: pivots, p_exclude_lang: lang, p_exclude_id: entryId, p_per_lang: PER_LANGUAGE,
  })
  if (error) throw error
  return crossLangSiblingRow.array().parse(data ?? []).map((r) => ({
    id: r.id, lang: r.lang, headword: r.headword, reading: r.reading, gender: r.gender,
    pos: r.pos, glossVi: cleanGlossVi(r.gloss_vi), glossEn: r.gloss_en,
  }))
}

/** A search hit read as an equivalent. Gender is not on a search row; the panel
 *  renders the label only when it is there. */
function toSibling(p: DictEntryPreview): CrossLangSibling {
  return {
    id: p.id, lang: p.lang, headword: p.headword, reading: p.reading ?? null,
    gender: null, pos: p.pos, glossVi: p.glossVi, glossEn: p.glossEn,
  }
}

/** What the dictionary knows about a list of surface forms. Synonyms, derived terms and
 *  inflections are stored as plain text; a form that is not an entry of its own comes back
 *  missing and the caller falls back to plain text. */
export async function getTermPreviews(
  supabase: SupabaseClient, lang: LangCode, texts: string[],
): Promise<TermPreview[]> {
  const wanted = [...new Set(texts.map((t) => t.trim()).filter(Boolean))]
  if (wanted.length === 0) return []
  const { data, error } = await supabase.schema('lex').rpc('term_previews', {
    p_lang: lang, p_texts: wanted,
  })
  if (error) throw error
  return termPreviewRow.array().parse(data ?? []).map((r) => ({
    matchText: r.match_text, id: r.id, headword: r.headword, pos: r.pos,
    ipa: r.ipa, reading: r.reading, gender: r.gender,
    glossVi: cleanGlossVi(r.gloss_vi), glossEn: r.gloss_en,
  }))
}

/** Inflected forms of an entry (the grammatical word family). */
export async function getInflections(supabase: SupabaseClient, entryId: string): Promise<WordForm[]> {
  const { data, error } = await supabase.schema('lex').from('inflections')
    .select('form_text, form_label').eq('entry_id', entryId)
  if (error) throw error
  return inflectionRow.array().parse(data ?? []).map((r) => ({ formText: r.form_text, formLabel: r.form_label }))
}

export { getCharacters } from './characters'
