import type { SupabaseClient } from '@supabase/supabase-js'
import { isOpenLicence } from '@/lib/dictionary/licence'
import { z } from '@/lib/zod'
import type { ClozeSentence } from './cloze'

/** What the sentence and form modes read beyond a practice word's six columns. */

const contextRow = z.object({
  id: z.string(),
  entry_id: z.string().nullable(),
  example: z.string().nullable(),
  example_translation: z.string().nullable(),
  pos: z.string().nullable(),
  kind: z.string().nullish(),
})

export interface PracticeContext {
  entryId: string | null
  example: ClozeSentence | null
  pos: string | null
  kind: string | null
}

/** Each saved word's entry, own example and part of speech, keyed by word id. */
export async function listPracticeContext(supabase: SupabaseClient, ids: string[]): Promise<Map<string, PracticeContext>> {
  if (ids.length === 0) return new Map()
  const { data, error } = await supabase.from('user_words').select('id, entry_id, example, example_translation, pos, kind').in('id', ids)
  if (error) throw error
  return new Map(contextRow.array().parse(data ?? []).map((r) => [r.id, {
    entryId: r.entry_id,
    example: r.example?.trim() ? { text: r.example, translationVi: r.example_translation } : null,
    pos: r.pos,
    kind: r.kind ?? null,
  }]))
}

const formRow = z.object({ entry_id: z.string(), form_text: z.string(), form_label: z.string().nullable() })

export interface EntryForm {
  text: string
  label: string | null
}

/** The forms `lex.inflections` lists for each entry: went and gone for go, gave up for give up. */
export async function listEntryForms(supabase: SupabaseClient, entryIds: string[]): Promise<Map<string, EntryForm[]>> {
  const out = new Map<string, EntryForm[]>()
  if (entryIds.length === 0) return out
  const { data, error } = await supabase.schema('lex').from('inflections')
    .select('entry_id, form_text, form_label').in('entry_id', entryIds).order('id').limit(3000)
  if (error) throw error
  for (const r of formRow.array().parse(data ?? [])) {
    const list = out.get(r.entry_id) ?? []
    list.push({ text: r.form_text, label: r.form_label })
    out.set(r.entry_id, list)
  }
  return out
}

const exampleRow = z.object({
  text: z.string(),
  translation_vi: z.string().nullable(),
  sources: z.object({ license: z.string().nullable() }).nullable().optional(),
})

/** Up to `per` example sentences of each entry under an open licence, translated ones first.
 *  One read per entry, so a word with hundreds of examples cannot crowd the others out. */
export async function listEntryExamples(supabase: SupabaseClient, entryIds: string[], per = 12): Promise<Map<string, ClozeSentence[]>> {
  const pairs = await Promise.all(entryIds.map(async (id): Promise<[string, ClozeSentence[]]> => {
    const { data, error } = await supabase.schema('lex').from('examples')
      .select('text, translation_vi, sources(license)').eq('entry_id', id)
      .order('translation_vi', { nullsFirst: false }).order('id').limit(per)
    if (error) throw error
    const rows = exampleRow.array().parse(data ?? []).filter((e) => !e.sources || isOpenLicence(e.sources.license))
    return [id, rows.map((e) => ({ text: e.text, translationVi: e.translation_vi }))]
  }))
  return new Map(pairs)
}

const phraseRow = z.object({
  id: z.string(),
  headword: z.string(),
  kind: z.string(),
  meaning_vi: z.string().nullable(),
  ipa: z.string().nullable(),
  audio_url: z.string().nullable(),
})

export interface SavedPhrase {
  id: string
  headword: string
  kind: string
  meaningVi: string | null
  ipa: string | null
  audioUrl: string | null
}

/** The English phrasal verbs, idioms, collocations and phrases in the notebook. */
export async function listSavedPhrases(supabase: SupabaseClient, limit = 200): Promise<SavedPhrase[]> {
  const { data, error } = await supabase.from('user_words')
    .select('id, headword, kind, meaning_vi, ipa, audio_url')
    .eq('lang', 'en').in('kind', ['phrasal_verb', 'idiom', 'collocation', 'phrase'])
    .order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return phraseRow.array().parse(data ?? []).map((r) => ({
    id: r.id, headword: r.headword, kind: r.kind, meaningVi: r.meaning_vi, ipa: r.ipa, audioUrl: r.audio_url,
  }))
}

const headwordRow = z.object({ headword_normalized: z.string() })

/** Which of `phrases` are English dictionary headwords, lower-cased. */
export async function listExistingPhrases(supabase: SupabaseClient, phrases: string[]): Promise<Set<string>> {
  const wanted = [...new Set(phrases.map((x) => x.toLowerCase()))]
  if (wanted.length === 0) return new Set()
  const { data, error } = await supabase.schema('lex').from('entries')
    .select('headword_normalized').eq('lang', 'en').in('headword_normalized', wanted).limit(1000)
  if (error) throw error
  return new Set(headwordRow.array().parse(data ?? []).map((r) => r.headword_normalized))
}
