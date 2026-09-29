import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from '@/lib/zod'
import { FEEDBACK_KINDS, type FeedbackKind } from '@/lib/dictionary/feedback'
import type { LangCode } from '@/lib/languages'

/** `admin.feedback_open` (supabase/migrations/0095_word_feedback.sql). The entry and sense
 *  columns are null when a reload removed them, since a report holds no foreign key. */
const feedbackRow = z.object({
  id: z.number(),
  entry_id: z.string(),
  headword: z.string().nullable(),
  lang: z.enum(['zh', 'es', 'en']).nullable(),
  sense_id: z.string().nullable(),
  sense_order: z.number().nullable(),
  gloss_vi: z.string().nullable(),
  gloss_en: z.string().nullable(),
  kind: z.enum(FEEDBACK_KINDS),
  message: z.string(),
  suggestion: z.string().nullable(),
  created_at: z.string(),
})

export interface FeedbackItem {
  id: number
  entryId: string
  headword: string | null
  lang: LangCode | null
  senseId: string | null
  senseOrder: number | null
  glossVi: string | null
  glossEn: string | null
  kind: FeedbackKind
  message: string
  suggestion: string | null
  createdAt: string
}

export function parseFeedback(raw: unknown): FeedbackItem[] {
  return z.array(feedbackRow).parse(raw).map((f) => ({
    id: f.id,
    entryId: f.entry_id,
    headword: f.headword,
    lang: f.lang,
    senseId: f.sense_id,
    senseOrder: f.sense_order,
    glossVi: f.gloss_vi,
    glossEn: f.gloss_en,
    kind: f.kind,
    message: f.message,
    suggestion: f.suggestion,
    createdAt: f.created_at,
  }))
}

export async function getOpenFeedback(supabase: SupabaseClient): Promise<FeedbackItem[]> {
  const { data, error } = await supabase.schema('admin').rpc('feedback_open')
  if (error) throw error
  return parseFeedback(data)
}

/** Apply writes the suggestion over the sense's Vietnamese gloss, so it needs a meaning
 *  report, a sense that still exists and a suggestion. */
export const canApply = (f: Pick<FeedbackItem, 'kind' | 'senseId' | 'senseOrder' | 'suggestion'>): boolean =>
  f.kind === 'meaning' && f.senseId !== null && f.senseOrder !== null && Boolean(f.suggestion?.trim())
