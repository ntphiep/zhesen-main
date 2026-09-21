import { unstable_cache } from 'next/cache'
import { LEX_REVALIDATE } from '@/lib/dictionary/cached'
import { createContentClient } from '@/lib/supabase/content'
import { listGrammarPointsByLang, countGrammarPointsByLang, getGrammarPointDetail, getGrammarPointsForEntry } from './queries'
import type { GrammarPoint, GrammarPointDetail } from './types'
import type { LangCode } from '@/lib/languages'

export const getCachedGrammarPointsByLang = unstable_cache(
  (lang: LangCode): Promise<GrammarPoint[]> => listGrammarPointsByLang(createContentClient(), lang),
  ['grammar-points-by-lang'],
  { revalidate: LEX_REVALIDATE, tags: ['lex'] },
)

export const getCachedGrammarLangCounts = unstable_cache(
  (): Promise<Record<LangCode, number>> => countGrammarPointsByLang(createContentClient()),
  ['grammar-lang-counts'],
  { revalidate: LEX_REVALIDATE, tags: ['lex'] },
)

export const getCachedGrammarPointDetail = unstable_cache(
  (id: string): Promise<GrammarPointDetail | null> => getGrammarPointDetail(createContentClient(), id),
  ['grammar-point-detail'],
  { revalidate: LEX_REVALIDATE, tags: ['lex'] },
)

export const getCachedGrammarPointsForEntry = unstable_cache(
  (entryId: string): Promise<GrammarPoint[]> => getGrammarPointsForEntry(createContentClient(), entryId),
  ['grammar-points-for-entry'],
  { revalidate: LEX_REVALIDATE, tags: ['lex'] },
)
