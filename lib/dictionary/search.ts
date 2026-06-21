import type { SupabaseClient } from '@supabase/supabase-js'
import type { LangCode } from '@/lib/content/types'
import type {
  DictEntryPreview, DictEntryDetail, DictSense, DictPron, DictExample, DictRelation,
  CrossLangSibling, CharInfo, WordForm,
} from './types'
import { entryPivots } from './crosslang'

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

/** Choose the most relevant senses to show, capped at `max`. The audience is
 * Vietnamese learners, so a sense that actually has a Vietnamese gloss is more
 * useful than an English-only one; we sort gloss_vi presence first, then by
 * sense_order (the source's commonness order). */
export function pickSenses(senses: DictSense[], max = 3): { shown: DictSense[]; hiddenCount: number } {
  const sorted = [...senses].sort(
    (a, b) => (Number(Boolean(b.glossVi)) - Number(Boolean(a.glossVi))) || a.senseOrder - b.senseOrder,
  )
  return { shown: sorted.slice(0, max), hiddenCount: Math.max(0, senses.length - max) }
}

/** A Chinese sense whose gloss is a CC-CEDICT classifier note (e.g.
 * "CL:隻|只[zhi1],條|条[tiao2]") rather than an actual meaning. */
export function isClassifierGloss(gloss: string | null): boolean {
  return Boolean(gloss && gloss.startsWith('CL:'))
}

/** Pull the (simplified) classifier characters out of a CC-CEDICT "CL:" gloss.
 * Each entry is `traditional|simplified[pinyin]`; we keep the simplified form and
 * drop the bracketed pinyin. Returns [] for a non-classifier gloss. */
export function parseClassifiers(gloss: string | null): string[] {
  if (!isClassifierGloss(gloss)) return []
  const out: string[] = []
  for (const tok of gloss!.slice(3).split(',')) {
    const noPinyin = tok.replace(/\[[^\]]*\]/g, '').trim()
    if (!noPinyin) continue
    const parts = noPinyin.split('|')
    const simp = (parts.length > 1 ? parts[1] : parts[0]).trim()
    if (simp && !out.includes(simp)) out.push(simp)
  }
  return out
}

// Very common English words, used to detect a token that is several words run
// together (e.g. "Ilastsawher" = i+last+saw+her). Kept small and high-frequency so
// the check below rarely fires on a real long word.
const COMMON_WORDS = new Set([
  'i', 'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'as', 'by', 'from',
  'is', 'are', 'was', 'were', 'be', 'been', 'do', 'did', 'does', 'has', 'had', 'have', 'will', 'would',
  'can', 'could', 'not', 'no', 'so', 'but', 'up', 'out', 'all', 'this', 'that', 'these', 'those',
  'he', 'she', 'it', 'we', 'they', 'you', 'me', 'him', 'her', 'his', 'my', 'your', 'our', 'their',
  'who', 'what', 'when', 'where', 'how', 'then', 'there', 'here', 'into', 'over', 'about', 'like', 'just',
  'one', 'two', 'got', 'get', 'see', 'saw', 'last', 'man', 'day', 'hat', 'red', 'blue', 'lake', 'house',
  'mother', 'father', 'child', 'picture', 'history', 'test', 'friend', 'told', 'seen', 'swimmer', 'better', 'far',
])
const MAX_COMMON_LEN = 8

/** Greedy longest-match segmentation of a lowercase token into COMMON_WORDS.
 * Returns the number of pieces, or 0 if it cannot be fully segmented. */
function segmentCommon(token: string): number {
  let i = 0
  let pieces = 0
  while (i < token.length) {
    let matched = 0
    for (let len = Math.min(MAX_COMMON_LEN, token.length - i); len >= 1; len--) {
      if (COMMON_WORDS.has(token.slice(i, i + len))) { matched = len; break }
    }
    if (matched === 0) return 0
    i += matched
    pieces++
  }
  return pieces
}

/** Heuristic: reject example sentences whose words have run together (pipeline data
 * corruption). Catches camelCase boundaries, over-long tokens, and a long token that
 * fully decomposes into 3+ common words (e.g. "Ilastsawher"). */
export function isCleanExample(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (/[a-z][A-Z]/.test(t)) return false
  for (const w of t.split(/\s+/)) {
    const letters = w.replace(/[^\p{L}]/gu, '')
    if (letters.length > 14) return false
    if (letters.length >= 11 && segmentCommon(letters.toLowerCase()) >= 3) return false
  }
  return true
}

interface SenseRow { pos: string | null; gloss_vi: string | null; gloss_en: string | null; sense_order: number }
interface PronRow { accent: string; ipa: string | null; audio_url: string | null }

function toSenses(rows: SenseRow[] | null): DictSense[] {
  return (rows ?? []).map((r) => ({ pos: r.pos, glossVi: r.gloss_vi, glossEn: r.gloss_en, senseOrder: r.sense_order }))
}
function toProns(rows: PronRow[] | null): DictPron[] {
  return (rows ?? []).map((r) => ({ accent: r.accent, ipa: r.ipa, audioUrl: r.audio_url }))
}

interface EntryPreviewRow {
  id: string; lang: LangCode; headword: string; traditional: string | null; level: string | null
  frequency_rank: number | null
  attributes: Record<string, unknown> | null
  senses: SenseRow[] | null
  pronunciations: PronRow[] | null
}

const PREVIEW_SELECT =
  'id, lang, headword, traditional, level, frequency_rank, attributes, senses(pos, gloss_vi, gloss_en, sense_order), pronunciations(accent, ipa, audio_url)'

function toPreview(r: EntryPreviewRow): DictEntryPreview {
  const senses = toSenses(r.senses)
  const prons = toProns(r.pronunciations)
  const primary = pickPrimarySense(senses)
  return {
    id: r.id, lang: r.lang, headword: r.headword, traditional: r.traditional, level: r.level,
    ipa: pickIpa(prons, r.lang),
    pos: primary?.pos ?? null,
    glossVi: primary?.glossVi ?? null,
    glossEn: primary?.glossEn ?? null,
    audioUrl: prons.find((p) => p.audioUrl)?.audioUrl ?? null,
    frequencyRank: r.frequency_rank ?? null,
  }
}

export async function searchEntries(
  supabase: SupabaseClient, lang: LangCode, query: string, limit = 20,
): Promise<DictEntryPreview[]> {
  const q = query.trim()
  if (!q) return []
  const { data, error } = await supabase
    .schema('lex')
    .from('entries')
    .select(PREVIEW_SELECT)
    .eq('lang', lang)
    .ilike('headword', `${q}%`)
    .order('frequency_rank', { ascending: true, nullsFirst: false })
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as unknown as EntryPreviewRow[]).map(toPreview)
}

/** Search all supported languages at once, grouped by language (for auto-detect search). */
export async function searchAllLanguages(
  supabase: SupabaseClient, query: string, perLang = 8,
): Promise<Record<LangCode, DictEntryPreview[]>> {
  const q = query.trim()
  if (!q) return { en: [], zh: [], es: [] }
  const [en, zh, es] = await Promise.all([
    searchEntries(supabase, 'en', q, perLang),
    searchEntries(supabase, 'zh', q, perLang),
    searchEntries(supabase, 'es', q, perLang),
  ])
  return { en, zh, es }
}

/** Most frequent entries for a language (for the per-language "common words" list). */
export async function getCommonWords(
  supabase: SupabaseClient, lang: LangCode, limit = 24,
): Promise<DictEntryPreview[]> {
  const { data, error } = await supabase
    .schema('lex')
    .from('entries')
    .select(PREVIEW_SELECT)
    .eq('lang', lang)
    .order('frequency_rank', { ascending: true, nullsFirst: false })
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as unknown as EntryPreviewRow[]).map(toPreview)
}

/** All headwords for a language (zh needs the set for longest-match segmentation). */
export async function getHeadwords(supabase: SupabaseClient, lang: LangCode): Promise<string[]> {
  const { data, error } = await supabase.schema('lex').from('entries').select('headword').eq('lang', lang)
  if (error) throw error
  return ((data ?? []) as { headword: string }[]).map((r) => r.headword)
}

/**
 * Resolve word tokens to dictionary entries for tap-to-lookup. Matches the
 * lowercased token against `headword_normalized`, then (for the rest) against
 * inflected forms in `lex.inflections`. Returns a map keyed by lowercased token.
 */
export async function resolveTokens(
  supabase: SupabaseClient, lang: LangCode, tokens: string[],
): Promise<Map<string, DictEntryPreview>> {
  const lowered = [...new Set(tokens.map((t) => t.toLowerCase()).filter(Boolean))]
  const out = new Map<string, DictEntryPreview>()
  if (lowered.length === 0) return out

  const direct = await supabase.schema('lex').from('entries')
    .select(PREVIEW_SELECT).eq('lang', lang).in('headword_normalized', lowered)
  if (direct.error) throw direct.error
  for (const row of (direct.data ?? []) as unknown as EntryPreviewRow[]) {
    out.set(row.headword.toLowerCase(), toPreview(row))
  }

  const remaining = lowered.filter((t) => !out.has(t))
  if (remaining.length === 0) return out

  const infl = await supabase.schema('lex').from('inflections')
    .select('form_text, entry_id').in('form_text', remaining)
  if (infl.error) throw infl.error
  const inflRows = (infl.data ?? []) as { form_text: string; entry_id: string }[]
  if (inflRows.length === 0) return out

  const ids = [...new Set(inflRows.map((r) => r.entry_id))]
  const ent = await supabase.schema('lex').from('entries')
    .select(PREVIEW_SELECT).in('id', ids).eq('lang', lang)
  if (ent.error) throw ent.error
  const byId = new Map<string, DictEntryPreview>()
  for (const row of (ent.data ?? []) as unknown as EntryPreviewRow[]) byId.set(row.id, toPreview(row))
  for (const r of inflRows) {
    const p = byId.get(r.entry_id)
    if (p && !out.has(r.form_text)) out.set(r.form_text, p)
  }
  return out
}

interface ExampleRow { text: string; reading: string | null; translation_vi: string | null; translation_en: string | null }
interface RelationRow { relation_type: string; related_text: string | null; related_entry_id: string | null }
interface EntryDetailRow extends EntryPreviewRow {
  examples: ExampleRow[] | null
  lex_relations: RelationRow[] | null
}

export async function getEntryDetail(supabase: SupabaseClient, entryId: string): Promise<DictEntryDetail | null> {
  const { data, error } = await supabase
    .schema('lex')
    .from('entries')
    .select('id, lang, headword, traditional, level, frequency_rank, attributes, senses(pos, gloss_vi, gloss_en, sense_order), pronunciations(accent, ipa, audio_url), examples!examples_entry_id_fkey(text, reading, translation_vi, translation_en), lex_relations!lex_relations_entry_id_fkey(relation_type, related_text, related_entry_id)')
    .eq('id', entryId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const r = data as unknown as EntryDetailRow
  const preview = toPreview(r)
  const examples: DictExample[] = (r.examples ?? []).map((e) => ({
    text: e.text, reading: e.reading, translationVi: e.translation_vi, translationEn: e.translation_en,
  }))
  const relations: DictRelation[] = (r.lex_relations ?? []).map((x) => ({
    relationType: x.relation_type, relatedText: x.related_text, relatedEntryId: x.related_entry_id,
  }))
  return {
    ...preview,
    senses: toSenses(r.senses),
    pronunciations: toProns(r.pronunciations),
    examples, relations,
    attributes: r.attributes ?? {},
  }
}

interface SiblingRpcRow { id: string; lang: LangCode; headword: string; gloss_vi: string | null; gloss_en: string | null }

/**
 * Equivalents of an entry in the other languages, bridged through an English
 * pivot (see crosslang.ts). Pivot terms are computed here; the actual match runs
 * in the `lex.match_cross_language` SQL function so it is not subject to the
 * PostgREST row cap (the old "fetch all zh/es and filter in JS" approach silently
 * dropped most entries). Same-language matches are excluded — this is the
 * "other languages" panel, not a synonyms list.
 */
export async function getCrossLanguage(
  supabase: SupabaseClient, entryId: string,
): Promise<CrossLangSibling[]> {
  const src = await supabase.schema('lex').from('entries')
    .select('lang, headword_normalized, senses(gloss_en)').eq('id', entryId).maybeSingle()
  if (src.error) throw src.error
  const row = src.data as { lang: LangCode; headword_normalized: string | null; senses: { gloss_en: string | null }[] | null } | null
  if (!row) return []

  const pivots = entryPivots(row.lang, row.headword_normalized ?? '', (row.senses ?? []).map((s) => s.gloss_en))
  if (pivots.length === 0) return []

  const { data, error } = await supabase.schema('lex').rpc('match_cross_language', {
    p_terms: pivots, p_exclude_lang: row.lang, p_exclude_id: entryId,
  })
  if (error) throw error
  return ((data ?? []) as SiblingRpcRow[]).map((r) => ({
    id: r.id, lang: r.lang, headword: r.headword, glossVi: r.gloss_vi, glossEn: r.gloss_en,
  }))
}

interface CharRow {
  char: string; radical: string | null; stroke_count: number | null
  han_viet: string[] | null; pinyin: string[] | null; gloss: string | null
}

/** Inflected forms of an entry (the grammatical word family). */
export async function getInflections(supabase: SupabaseClient, entryId: string): Promise<WordForm[]> {
  const { data, error } = await supabase.schema('lex').from('inflections')
    .select('form_text, form_label').eq('entry_id', entryId)
  if (error) throw error
  return ((data ?? []) as { form_text: string; form_label: string | null }[])
    .map((r) => ({ formText: r.form_text, formLabel: r.form_label }))
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
  const byChar = new Map(((data ?? []) as CharRow[]).map((r) => [r.char, r]))
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
