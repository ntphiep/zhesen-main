import { unstable_cache } from 'next/cache'
import { createContentClient } from '@/lib/supabase/content'
import { listGrammarPointsByLang, countGrammarPointsByLang, getGrammarPointDetail, getGrammarPointsForEntry } from './queries'
import type { GrammarPoint, GrammarPointDetail } from './types'
import type { LangCode } from '@/lib/languages'

export const getCachedGrammarPointsByLang = unstable_cache(
  (lang: LangCode): Promise<GrammarPoint[]> => listGrammarPointsByLang(createContentClient(), lang),
  ['grammar-points-by-lang'],
  { revalidate: 3600, tags: ['lex'] },
)

export const getCachedGrammarLangCounts = unstable_cache(
  (): Promise<Record<LangCode, number>> => countGrammarPointsByLang(createContentClient()),
  ['grammar-lang-counts'],
  { revalidate: 3600, tags: ['lex'] },
)

export const getCachedGrammarPointDetail = unstable_cache(
  (id: string): Promise<GrammarPointDetail | null> => getGrammarPointDetail(createContentClient(), id),
  ['grammar-point-detail'],
  { revalidate: 3600, tags: ['lex'] },
)

export const getCachedGrammarPointsForEntry = unstable_cache(
  (entryId: string): Promise<GrammarPoint[]> => getGrammarPointsForEntry(createContentClient(), entryId),
  ['grammar-points-for-entry'],
  { revalidate: 3600, tags: ['lex'] },
)
