import type { SupabaseClient } from '@supabase/supabase-js'
import type { LangCode } from '@/lib/content/types'
import type {
  DictEntryPreview, DictEntryDetail, DictSense, DictPron, DictExample, DictRelation,
  CrossLangSibling, CharInfo,
} from './types'

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
  attributes: Record<string, unknown> | null
  senses: SenseRow[] | null
  pronunciations: PronRow[] | null
}

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
    .select('id, lang, headword, traditional, level, attributes, senses(pos, gloss_vi, gloss_en, sense_order), pronunciations(accent, ipa, audio_url)')
    .eq('lang', lang)
    .ilike('headword', `${q}%`)
    .order('frequency_rank', { ascending: true, nullsFirst: false })
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as unknown as EntryPreviewRow[]).map(toPreview)
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
    .select('id, lang, headword, traditional, level, attributes, senses(pos, gloss_vi, gloss_en, sense_order), pronunciations(accent, ipa, audio_url), examples!examples_entry_id_fkey(text, reading, translation_vi, translation_en), lex_relations!lex_relations_entry_id_fkey(relation_type, related_text, related_entry_id)')
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

interface ConceptRow { concept_id: string | null }
interface LinkRow { from_entry_id: string | null; to_entry_id: string | null }
interface SiblingRow {
  id: string; lang: LangCode; headword: string
  senses: { gloss_vi: string | null; sense_order: number }[] | null
}

export async function getCrossLanguage(
  supabase: SupabaseClient, entryId: string,
): Promise<CrossLangSibling[]> {
  const links = supabase.schema('lex').from('cross_language_links')
  const [from, to] = await Promise.all([
    links.select('concept_id').eq('from_entry_id', entryId),
    supabase.schema('lex').from('cross_language_links').select('concept_id').eq('to_entry_id', entryId),
  ])
  if (from.error) throw from.error
  if (to.error) throw to.error
  const conceptIds = [...new Set(
    [...(from.data ?? []), ...(to.data ?? [])]
      .map((r) => (r as ConceptRow).concept_id)
      .filter((c): c is string => Boolean(c)),
  )]
  if (conceptIds.length === 0) return []

  const sib = await supabase.schema('lex').from('cross_language_links')
    .select('from_entry_id, to_entry_id').in('concept_id', conceptIds)
  if (sib.error) throw sib.error
  const candidateIds = [...new Set(
    ((sib.data ?? []) as LinkRow[])
      .flatMap((r) => [r.from_entry_id, r.to_entry_id])
      .filter((id): id is string => Boolean(id)),
  )].filter((id) => id !== entryId)
  if (candidateIds.length === 0) return []

  const entries = await supabase.schema('lex').from('entries')
    .select('id, lang, headword, senses(gloss_vi, sense_order)').in('id', candidateIds)
  if (entries.error) throw entries.error
  return ((entries.data ?? []) as unknown as SiblingRow[]).map((r) => {
    const primary = [...(r.senses ?? [])].sort((a, b) => a.sense_order - b.sense_order)[0]
    return { id: r.id, lang: r.lang, headword: r.headword, glossVi: primary?.gloss_vi ?? null }
  })
}

interface CharRow {
  char: string; radical: string | null; stroke_count: number | null
  han_viet: string[] | null; pinyin: string[] | null; gloss: string | null
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
