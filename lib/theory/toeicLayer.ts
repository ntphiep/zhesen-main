import { unstable_cache } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from '@/lib/zod'
import { createContentClient } from '@/lib/supabase/content'
import { LEX_REVALIDATE } from '@/lib/dictionary/cached'

/** What a TOEIC topic reads of one published learner layer: who wrote and reviewed it, and
 *  each sense's Vietnamese terms with its sentences. The word page's read leaves out the
 *  two model columns. */
export interface ToeicLayer {
  model: string
  reviewer: string | null
  senses: { viTerms: string[]; examples: { text: string; vi: string; byModel: boolean }[] }[]
}

const layerRow = z.object({
  model: z.string(),
  reviewer: z.string().nullable(),
  learner_senses: z.array(z.object({
    sense_order: z.number(),
    vi_terms: z.array(z.string()),
    learner_examples: z.array(z.object({
      example_order: z.number(),
      text: z.string(),
      vi: z.string(),
      source_example_id: z.number().nullable(),
    })),
  })),
})

export async function getToeicLayer(supabase: SupabaseClient, entryId: string): Promise<ToeicLayer | null> {
  const { data, error } = await supabase.schema('lex').from('learner_entries')
    .select('model, reviewer, learner_senses(sense_order, vi_terms, learner_examples(example_order, text, vi, source_example_id))')
    .eq('entry_id', entryId).eq('status', 'published').maybeSingle()
  if (error) throw error
  if (!data) return null
  const r = layerRow.parse(data)
  return {
    model: r.model,
    reviewer: r.reviewer,
    senses: [...r.learner_senses].sort((a, b) => a.sense_order - b.sense_order).map((s) => ({
      viTerms: s.vi_terms,
      examples: [...s.learner_examples].sort((a, b) => a.example_order - b.example_order)
        .map((x) => ({ text: x.text, vi: x.vi, byModel: x.source_example_id === null })),
    })),
  }
}

/** Not wrapped like `getCachedLearnerLayer`: a failed read throws, so neither this cache
 *  nor the topic page's route cache keeps a topic without its sentences. */
export const getCachedToeicLayer = unstable_cache(
  (entryId: string): Promise<ToeicLayer | null> => getToeicLayer(createContentClient(), entryId),
  ['toeic-learner-layer-v1'],
  { revalidate: LEX_REVALIDATE, tags: ['lex'] },
)
