import { unstable_cache } from 'next/cache'
import { createContentClient } from '@/lib/supabase/content'
import { LEX_REVALIDATE } from './cached'
import { getLearnerBacklinks, getLearnerLayer, type LearnerBacklink, type LearnerLayer } from './learner'

/** The learner layer's reads, cached like the rest of the dictionary. Apart from `./cached`
 *  because a failure must not reach the page: a read that throws is logged and answered
 *  empty, so the data cache keeps nothing, but the word page rendered then is cached
 *  without its layer until the `lex` tag is flushed or its revalidate window ends. */

// The cache keeps the parsed layer for a week and keys on this source, not the parser's, so
// a change to what `parseLearnerLayer` returns bumps the version.
const cachedLayer = unstable_cache(
  (entryId: string): Promise<LearnerLayer | null> => getLearnerLayer(createContentClient(), entryId),
  ['dict-learner-layer-v6'],
  { revalidate: LEX_REVALIDATE, tags: ['lex'] },
)

const cachedBacklinks = unstable_cache(
  (entryId: string): Promise<LearnerBacklink[]> => getLearnerBacklinks(createContentClient(), entryId),
  ['dict-learner-backlinks-v1'],
  { revalidate: LEX_REVALIDATE, tags: ['lex'] },
)

export async function getCachedLearnerLayer(entryId: string): Promise<LearnerLayer | null> {
  try {
    return await cachedLayer(entryId)
  } catch (e) {
    console.error('learner layer failed', entryId, e)
    return null
  }
}

export async function getCachedLearnerBacklinks(entryId: string): Promise<LearnerBacklink[]> {
  try {
    return await cachedBacklinks(entryId)
  } catch (e) {
    console.error('learner backlinks failed', entryId, e)
    return []
  }
}
