import { unstable_cache } from 'next/cache'

/**
 * How long a dictionary read stays cached.
 *
 * Seven days, not the hour every one of these used to carry. The dictionary is a static
 * corpus: an entry changes when a load script runs, which is a handful of times a year,
 * and `POST /api/revalidate` flushes the `lex` tag by hand when one does. An hour meant
 * that with 36,361 entries and the traffic this site has, essentially every visit to a
 * word page was the first one inside its window and paid three sequential round trips to
 * Seoul. Measured on production: a word nobody had opened cost 542 to 1,723 ms, the same
 * word again cost 128 to 159 ms.
 *
 * Raising it does not risk stale data reaching a learner unnoticed, because nothing writes
 * to `lex` except a load, and a load is the moment to call `/api/revalidate`.
 */
export const LEX_REVALIDATE = 604800
import { createContentClient } from '@/lib/supabase/content'
import { getEntryDetail, getCrossLanguage, getCharacters, getInflections, getTermPreviews } from './entryDetail'
import { getCommonWords, type CommonWordsOptions } from './search'
import { resolveTappableTexts, type ResolvedText } from './tappable'
import { getEntriesContaining } from './containing'
import { getWordKin } from './kin'
import { getWordOfDay, dayNumber, type DailyWord } from './wordOfDay'
import { getLevelsForLanguage, getEntriesByLevel, type LevelSummary, type LevelPage } from './levels'
import type { ContainingWord, DictEntryDetail, DictEntryPreview, CrossLangSibling, TermPreview, CharInfo, WordForm } from './types'
import type { LangCode } from '@/lib/languages'

export const getCachedEntryDetail = unstable_cache(
  (entryId: string): Promise<DictEntryDetail | null> => getEntryDetail(createContentClient(), entryId),
  ['dict-entry-detail'],
  { revalidate: LEX_REVALIDATE, tags: ['lex'] },
)

export const getCachedCrossLanguage = unstable_cache(
  (entryId: string): Promise<CrossLangSibling[]> => getCrossLanguage(createContentClient(), entryId),
  ['dict-cross-language'],
  { revalidate: LEX_REVALIDATE, tags: ['lex'] },
)

export const getCachedCharacters = unstable_cache(
  (headword: string): Promise<CharInfo[]> => getCharacters(createContentClient(), headword),
  ['dict-characters'],
  { revalidate: LEX_REVALIDATE, tags: ['lex'] },
)

export const getCachedEntriesContaining = unstable_cache(
  (lang: LangCode, headword: string): Promise<ContainingWord[]> =>
    getEntriesContaining(createContentClient(), lang, headword),
  ['dict-entries-containing'],
  { revalidate: LEX_REVALIDATE, tags: ['lex'] },
)

export const getCachedWordKin = unstable_cache(
  (lang: LangCode, stem: string, headword: string): Promise<DictEntryPreview[]> =>
    getWordKin(createContentClient(), lang, stem, headword),
  ['dict-word-kin'],
  { revalidate: LEX_REVALIDATE, tags: ['lex'] },
)

const cachedTermPreviews = unstable_cache(
  (lang: LangCode, texts: string[]): Promise<TermPreview[]> =>
    getTermPreviews(createContentClient(), lang, texts),
  ['dict-term-previews'],
  { revalidate: LEX_REVALIDATE, tags: ['lex'] },
)

/** Cached per language and set of terms. The normalisation must happen HERE, not inside the
 *  cached function: `unstable_cache` keys on the arguments it is handed, so the same words
 *  in a different order would be two cache entries and two round trips. */
export function getCachedTermPreviews(lang: LangCode, texts: string[]): Promise<TermPreview[]> {
  return cachedTermPreviews(lang, [...new Set(texts)].sort())
}

export const getCachedInflections = unstable_cache(
  (entryId: string): Promise<WordForm[]> => getInflections(createContentClient(), entryId),
  ['dict-inflections'],
  { revalidate: LEX_REVALIDATE, tags: ['lex'] },
)

// Keyed by day index so the word is stable for the whole day and cached across users.
/** Word of the day. The day index is computed in here, not passed in: `Date.now()` in a
 *  Server Component body breaks `react-hooks/purity`. After midnight the new word appears
 *  at worst one `revalidate` window later. This is the one read that is not static, so it
 *  keeps the hour rather than `LEX_REVALIDATE`. */
export const getCachedWordOfDay = unstable_cache(
  (): Promise<DailyWord | null> => getWordOfDay(createContentClient(), dayNumber(Date.now())),
  ['dict-word-of-day'],
  { revalidate: 3600, tags: ['lex'] },
)

export const getCachedCommonWords = unstable_cache(
  (lang: LangCode, options: CommonWordsOptions = {}): Promise<DictEntryPreview[]> =>
    getCommonWords(createContentClient(), lang, options),
  ['dict-common-words'],
  { revalidate: LEX_REVALIDATE, tags: ['lex'] },
)

export const getCachedLevelsForLanguage = unstable_cache(
  (lang: LangCode): Promise<LevelSummary[]> => getLevelsForLanguage(createContentClient(), lang),
  ['dict-levels-for-language'],
  { revalidate: LEX_REVALIDATE, tags: ['lex'] },
)

/** First page of a level's word list, for the initial server render of
 *  `/theory/[lang]/vocabulary/[level]`. "Load more" beyond it calls the uncached query from the client. */
export const getCachedEntriesByLevel = unstable_cache(
  (lang: LangCode, level: string, offset: number, limit: number): Promise<LevelPage> =>
    getEntriesByLevel(createContentClient(), lang, level, offset, limit),
  ['dict-entries-by-level'],
  { revalidate: LEX_REVALIDATE, tags: ['lex'] },
)

/** Tappable example sentences for one entry page, resolved server-side. Keyed by the texts
 *  themselves, so two entries quoting the same sentence share a cache entry. */
export const getCachedTappableTexts = unstable_cache(
  (lang: LangCode, texts: string[]): Promise<ResolvedText[]> =>
    resolveTappableTexts(createContentClient(), lang, texts),
  ['dict-tappable'],
  { revalidate: LEX_REVALIDATE, tags: ['lex'] },
)
