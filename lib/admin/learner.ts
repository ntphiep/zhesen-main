import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from '@/lib/zod'
import { splitEntryId } from '@/lib/dictionary/entryId'

/** `/admin/learner`: every learner layer (supabase/migrations/0076_learner_layer.sql), read
 *  through the admin's own session so RLS also returns the hidden ones. */

/** The audit page of one layer. */
export function auditHref(entryId: string): string {
  const { lang, key } = splitEntryId(entryId)
  return `/admin/learner/${lang}/${encodeURIComponent(key)}`
}

const status = z.enum(['published', 'hidden'])
const count = z.array(z.object({ count: z.number() }))

/** Written by a model, which may give a list or an object where text belongs: those read as
 *  JSON, and an item that is not an object is skipped, so the page always renders. */
// `.optional()`: zod 4 fails a missing key on a bare transform ("expected nonoptional").
const modelText = z.unknown().optional().transform((v) => (v === undefined || v === null ? null : typeof v === 'string' ? v : JSON.stringify(v)))

const listOf = <S extends z.ZodType>(item: S) => z.unknown().optional().transform((v): z.output<S>[] =>
  (Array.isArray(v) ? v : []).flatMap((x) => {
    const r = item.safeParse(x)
    return r.success ? [r.data] : []
  }))

const reviewRow = z.preprocess(
  (v) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {}),
  z.object({
    issues: listOf(z.object({ path: modelText, problem: modelText, fix: modelText, severity: modelText })),
    rejected: listOf(z.object({ path: modelText, reason: modelText })),
  }),
)

const entry = z.object({ headword: z.string(), lang: z.string() })

const listRow = z.object({
  entry_id: z.string(),
  status,
  model: z.string(),
  reviewer: z.string().nullable(),
  prompt_version: z.string(),
  created_at: z.string(),
  review: reviewRow,
  entries: entry,
  learner_senses: count,
  learner_links: count,
  sense_labels: count,
})

export interface ReviewIssue {
  path: string | null
  problem: string | null
  fix: string | null
  severity: string | null
}

export interface ReviewRejection {
  path: string | null
  reason: string | null
}

export interface LearnerLayerSummary {
  entryId: string
  headword: string
  lang: string
  status: 'published' | 'hidden'
  model: string
  reviewer: string | null
  promptVersion: string
  createdAt: string
  senses: number
  links: number
  labels: number
  issues: number
  rejected: number
}

const total = (rows: { count: number }[]) => rows[0]?.count ?? 0

export function parseLayerList(raw: unknown): LearnerLayerSummary[] {
  return listRow.array().parse(raw).map((r) => ({
    entryId: r.entry_id,
    headword: r.entries.headword,
    lang: r.entries.lang,
    status: r.status,
    model: r.model,
    reviewer: r.reviewer,
    promptVersion: r.prompt_version,
    createdAt: r.created_at,
    senses: total(r.learner_senses),
    links: total(r.learner_links),
    labels: total(r.sense_labels),
    issues: r.review.issues.length,
    rejected: r.review.rejected.length,
  }))
}

/** Rows per page of /admin/learner. Unpaged, PostgREST's 1,000-row cap cut the list at
 *  1,000 of 4,854 layers, and those 1,000 rows made a 2.6 MB page. */
export const LAYERS_PER_PAGE = 100

const pageRow = z.record(z.string(), z.unknown())
const countsRow = z.object({ entry_id: z.string(), learner_senses: z.unknown(), learner_links: z.unknown(), sense_labels: z.unknown() })

/** One page of layers in entry order, and how many there are. The embedded counts are read
 *  for that page's ids only: beside an offset, PostgREST counted them for every skipped row
 *  too, 0.89 s for page 48 against 0.18 s for page 1. */
export async function listLearnerLayers(supabase: SupabaseClient, page = 1): Promise<{ layers: LearnerLayerSummary[]; total: number }> {
  const lex = supabase.schema('lex')
  const from = (page - 1) * LAYERS_PER_PAGE
  const { data, error, count } = await lex.from('learner_entries')
    .select('entry_id, status, model, reviewer, prompt_version, created_at, review, entries(headword, lang)', { count: 'exact' })
    .order('entry_id')
    .range(from, from + LAYERS_PER_PAGE - 1)
  // PGRST103: a page past the last one, which a stale link can ask for.
  if (error?.code === 'PGRST103') return { layers: [], total: count ?? 0 }
  if (error) throw error
  const rows = z.array(pageRow).parse(data ?? [])
  const ids = rows.map((r) => String(r.entry_id))
  if (ids.length === 0) return { layers: [], total: count ?? 0 }
  const counts = await lex.from('learner_entries')
    .select('entry_id, learner_senses(count), learner_links(count), sense_labels(count)')
    .in('entry_id', ids)
  if (counts.error) throw counts.error
  const byId = new Map(z.array(countsRow).parse(counts.data ?? []).map((c) => [c.entry_id, c]))
  return { layers: parseLayerList(rows.map((r) => ({ ...r, ...byId.get(String(r.entry_id)) }))), total: count ?? ids.length }
}

const auditRow = z.object({
  entry_id: z.string(),
  status,
  model: z.string(),
  reviewer: z.string().nullable(),
  prompt_version: z.string(),
  created_at: z.string(),
  review: reviewRow,
  entries: entry,
  learner_senses: z.array(z.object({ sense_order: z.number(), vi_terms: z.array(z.string()) })),
  sense_labels: z.array(z.object({
    sense_id: z.string(),
    core_sense_order: z.number().nullable(),
    vi_terms: z.array(z.string()).nullable(),
    domain: z.string().nullable(),
    register: z.string().nullable(),
    is_inflection: z.boolean(),
    lemma: z.string().nullable(),
    fix_vi: z.string().nullable(),
    fix_reason: z.string().nullable(),
    previous_gloss_vi: z.string().nullable(),
    fixed_at: z.string().nullable(),
  })),
})

const rawSenseRow = z.object({
  id: z.string(),
  sense_order: z.number(),
  pos: z.string().nullable(),
  gloss_en: z.string().nullable(),
  gloss_vi: z.string().nullable(),
})

/** One raw sense beside what the layer made of it; `label` is null when the layer left it
 *  out. */
export interface AuditSense {
  id: string
  senseOrder: number
  pos: string | null
  glossEn: string | null
  glossVi: string | null
  label: {
    coreSenseOrder: number | null
    /** The core sense's Vietnamese terms, for a sense a core sense covers. */
    coreTerms: string | null
    viTerms: string[]
    domain: string | null
    register: string | null
    isInflection: boolean
    lemma: string | null
    fixVi: string | null
    fixReason: string | null
    previousGlossVi: string | null
    fixedAt: string | null
  } | null
}

export interface LearnerAudit {
  entryId: string
  headword: string
  lang: string
  status: 'published' | 'hidden'
  model: string
  reviewer: string | null
  promptVersion: string
  createdAt: string
  issues: ReviewIssue[]
  rejected: ReviewRejection[]
  senses: AuditSense[]
}

export function parseAudit(layer: unknown, senses: unknown): LearnerAudit {
  const r = auditRow.parse(layer)
  const core = new Map(r.learner_senses.map((s) => [s.sense_order, s.vi_terms.join(', ')]))
  const labels = new Map(r.sense_labels.map((l) => [l.sense_id, l]))
  return {
    entryId: r.entry_id,
    headword: r.entries.headword,
    lang: r.entries.lang,
    status: r.status,
    model: r.model,
    reviewer: r.reviewer,
    promptVersion: r.prompt_version,
    createdAt: r.created_at,
    issues: r.review.issues.map((i) => ({ path: i.path ?? null, problem: i.problem ?? null, fix: i.fix ?? null, severity: i.severity ?? null })),
    rejected: r.review.rejected.map((x) => ({ path: x.path ?? null, reason: x.reason ?? null })),
    senses: [...rawSenseRow.array().parse(senses)].sort((a, b) => a.sense_order - b.sense_order).map((s) => {
      const l = labels.get(s.id)
      return {
        id: s.id,
        senseOrder: s.sense_order,
        pos: s.pos,
        glossEn: s.gloss_en,
        glossVi: s.gloss_vi,
        label: l ? {
          coreSenseOrder: l.core_sense_order,
          coreTerms: l.core_sense_order === null ? null : core.get(l.core_sense_order) ?? null,
          viTerms: l.vi_terms ?? [],
          domain: l.domain,
          register: l.register,
          isInflection: l.is_inflection,
          lemma: l.lemma,
          fixVi: l.fix_vi,
          fixReason: l.fix_reason,
          previousGlossVi: l.previous_gloss_vi,
          fixedAt: l.fixed_at,
        } : null,
      }
    }),
  }
}

/** One layer and every raw sense of its entry, or null when the entry has no layer. */
export async function getLearnerAudit(supabase: SupabaseClient, entryId: string): Promise<LearnerAudit | null> {
  const lex = supabase.schema('lex')
  const [layer, senses] = await Promise.all([
    lex.from('learner_entries')
      .select('entry_id, status, model, reviewer, prompt_version, created_at, review, entries(headword, lang), learner_senses(sense_order, vi_terms), sense_labels(sense_id, core_sense_order, vi_terms, domain, register, is_inflection, lemma, fix_vi, fix_reason, previous_gloss_vi, fixed_at)')
      .eq('entry_id', entryId)
      .maybeSingle(),
    lex.from('senses').select('id, sense_order, pos, gloss_en, gloss_vi').eq('entry_id', entryId).order('sense_order'),
  ])
  if (layer.error) throw layer.error
  if (senses.error) throw senses.error
  return layer.data ? parseAudit(layer.data, senses.data ?? []) : null
}

/** The refusals `admin.learner_set_status` raises, in words. */
export const LEARNER_REFUSALS: Record<string, string> = {
  unknown_status: 'That status does not exist.',
  unknown_entry: 'This entry has no learner layer.',
}
