import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from '@/lib/zod'
import type { LangCode } from '@/lib/languages'

/** `admin.entry`, `admin.coverage` (supabase/migrations/0060_admin_entry_edit.sql). */
const lang = z.enum(['zh', 'es', 'en'])

const entryRow = z.object({
  id: z.string(),
  lang,
  headword: z.string(),
  flag: z.object({ reason: z.string(), flagged_at: z.string() }).nullable(),
  senses: z.array(z.object({
    id: z.string(),
    pos: z.string().nullable(),
    sense_order: z.number(),
    gloss_vi: z.string().nullable(),
    gloss_vi_is_mt: z.boolean(),
    gloss_en: z.string().nullable(),
  })),
})

export interface AdminSense {
  id: string
  pos: string | null
  senseOrder: number
  glossVi: string | null
  glossViIsMt: boolean
  glossEn: string | null
}

export interface AdminEntry {
  id: string
  lang: LangCode
  headword: string
  flag: { reason: string; flaggedAt: string } | null
  senses: AdminSense[]
}

export function parseEntry(raw: unknown): AdminEntry | null {
  if (raw === null) return null
  const x = entryRow.parse(raw)
  return {
    id: x.id,
    lang: x.lang,
    headword: x.headword,
    flag: x.flag && { reason: x.flag.reason, flaggedAt: x.flag.flagged_at },
    senses: x.senses.map((s) => ({
      id: s.id,
      pos: s.pos,
      senseOrder: s.sense_order,
      glossVi: s.gloss_vi,
      glossViIsMt: s.gloss_vi_is_mt,
      glossEn: s.gloss_en,
    })),
  }
}

export async function getAdminEntry(supabase: SupabaseClient, entryId: string): Promise<AdminEntry | null> {
  const { data, error } = await supabase.schema('admin').rpc('entry', { p_entry: entryId })
  if (error) throw error
  return parseEntry(data)
}

const coverageRow = z.object({
  languages: z.array(z.object({
    lang,
    entries: z.number(),
    senses: z.number(),
    senses_vi: z.number(),
    senses_mt: z.number(),
    flagged: z.number(),
  })),
  flagged: z.array(z.object({
    entry_id: z.string(),
    headword: z.string(),
    lang,
    reason: z.string(),
    flagged_at: z.string(),
  })),
})

export interface LanguageCoverage {
  lang: LangCode
  entries: number
  senses: number
  sensesVi: number
  sensesMt: number
  flagged: number
}

export interface FlaggedEntry {
  entryId: string
  headword: string
  lang: LangCode
  reason: string
  flaggedAt: string
}

export interface Coverage {
  languages: LanguageCoverage[]
  flagged: FlaggedEntry[]
}

export function parseCoverage(raw: unknown): Coverage {
  const x = coverageRow.parse(raw)
  return {
    languages: x.languages.map((l) => ({
      lang: l.lang,
      entries: l.entries,
      senses: l.senses,
      sensesVi: l.senses_vi,
      sensesMt: l.senses_mt,
      flagged: l.flagged,
    })),
    flagged: x.flagged.map((f) => ({
      entryId: f.entry_id,
      headword: f.headword,
      lang: f.lang,
      reason: f.reason,
      flaggedAt: f.flagged_at,
    })),
  }
}

export async function getCoverage(supabase: SupabaseClient): Promise<Coverage> {
  const { data, error } = await supabase.schema('admin').rpc('coverage')
  if (error) throw error
  return parseCoverage(data)
}

/** Over this length `lex.gloss_terms_reload` reads a gloss as a definition and indexes
 *  none of it, so the Vietnamese lookup stops finding the entry by that sense (0048). */
export const GLOSS_TERM_MAX = 80

/** Why a Vietnamese gloss would not reach the lookup index, or null when it will. */
export function glossWarning(glossVi: string): string | null {
  // Code points, as Postgres `length` counts them, not UTF-16 units.
  const n = [...glossVi.trim()].length
  if (n > GLOSS_TERM_MAX) {
    return `${n} characters, over ${GLOSS_TERM_MAX}: a Vietnamese lookup will not find the entry by this sense.`
  }
  return null
}

/** The refusals the content functions raise (0060, 0095), in words. */
export const CONTENT_REFUSALS: Record<string, string> = {
  no_such_sense: 'This sense no longer exists.',
  no_such_entry: 'This entry no longer exists.',
  no_such_feedback: 'This report no longer exists.',
  feedback_resolved: 'This report is already closed.',
  nothing_to_apply: 'Only a wrong-meaning report on one sense, with a suggestion, can be applied.',
}
