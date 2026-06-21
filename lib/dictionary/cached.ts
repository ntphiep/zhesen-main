import { unstable_cache } from 'next/cache'
import { createContentClient } from '@/lib/supabase/content'
import { getEntryDetail, getCrossLanguage, getCharacters, getInflections, getCommonWords } from './search'
import { getWordOfDay, type DailyWord } from './wordOfDay'
import type { DictEntryDetail, DictEntryPreview, CrossLangSibling, CharInfo, WordForm } from './types'
import type { LangCode } from '@/lib/content/types'

export const getCachedEntryDetail = unstable_cache(
  (entryId: string): Promise<DictEntryDetail | null> => getEntryDetail(createContentClient(), entryId),
  ['dict-entry-detail'],
  { revalidate: 3600, tags: ['lex'] },
)

export const getCachedCrossLanguage = unstable_cache(
  (entryId: string): Promise<CrossLangSibling[]> => getCrossLanguage(createContentClient(), entryId),
  ['dict-cross-language'],
  { revalidate: 3600, tags: ['lex'] },
)

export const getCachedCharacters = unstable_cache(
  (headword: string): Promise<CharInfo[]> => getCharacters(createContentClient(), headword),
  ['dict-characters'],
  { revalidate: 3600, tags: ['lex'] },
)

export const getCachedInflections = unstable_cache(
  (entryId: string): Promise<WordForm[]> => getInflections(createContentClient(), entryId),
  ['dict-inflections'],
  { revalidate: 3600, tags: ['lex'] },
)

// Keyed by day index so the word is stable for the whole day and cached across users.
export const getCachedWordOfDay = unstable_cache(
  (dayNum: number): Promise<DailyWord | null> => getWordOfDay(createContentClient(), dayNum),
  ['dict-word-of-day'],
  { revalidate: 3600, tags: ['lex'] },
)

export const getCachedCommonWords = unstable_cache(
  (lang: LangCode): Promise<DictEntryPreview[]> => getCommonWords(createContentClient(), lang),
  ['dict-common-words'],
  { revalidate: 3600, tags: ['lex'] },
)
