import { unstable_cache } from 'next/cache'
import { LEX_REVALIDATE } from '@/lib/dictionary/cached'
import { resolveTappableTexts } from '@/lib/dictionary/tappable'
import { createContentClient } from '@/lib/supabase/content'
import { packWords, tappableTexts, type PackedWord } from './passage'
import { TOEIC_TESTS } from './tests'

/** Every word of one test, resolved in one pass and cached packed. Not through
 *  `getCachedTappableTexts`: its per-text result for test01 is 2,495,412 bytes, over the
 *  2 MB a data cache item may hold, so it was never stored. `version` keys the cache on the
 *  content, so an edited test is resolved again. */
export const getCachedToeicWords = unstable_cache(
  async (id: string, version: string): Promise<PackedWord[]> => {
    const test = TOEIC_TESTS.find((t) => t.id === id && t.version === version)
    if (!test) return []
    return packWords(await resolveTappableTexts(createContentClient(), 'en', tappableTexts(test.groups)))
  },
  ['toeic-words-v1'],
  { revalidate: LEX_REVALIDATE, tags: ['lex'] },
)
