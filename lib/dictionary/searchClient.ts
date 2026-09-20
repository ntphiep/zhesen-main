import { searchResponse, type SearchResponse } from './response'
import { LANG_CODES, type LangCode } from '@/lib/languages'

/** One call to the cached /dictionary/search route. `refused` is an outcome, not an error:
 *  a rate-limited caller gets a non-OK status and no result set, and "no results found"
 *  would be a claim about a dictionary that was never asked. */
export type SearchOutcome =
  | { status: 'ok'; data: SearchResponse }
  | { status: 'refused' }

export interface SearchOptions {
  /** Which languages to translate into. Omitted means all three. */
  langs?: readonly LangCode[]
  /** `reverse` asks only the Vietnamese lookup, for the Vietnamese-first page. */
  direction?: 'both' | 'reverse'
}

/** The query string the route reads. Exported because the search box keys its own
 *  in-memory cache on it, and the two must agree on what makes a request distinct. */
export function searchQueryString(query: string, opts: SearchOptions = {}): string {
  const langs = opts.langs ?? LANG_CODES
  const params = new URLSearchParams({ q: query.trim() })
  if (langs.length !== LANG_CODES.length) params.set('langs', langs.join(','))
  if (opts.direction === 'reverse') params.set('dir', 'reverse')
  return params.toString()
}

/** Search through the route, never straight from the browser to Supabase: the route holds
 *  the server-side cache and the per-address budget. Aborts and network failures reject,
 *  and the caller decides what to show. */
export async function fetchSearch(
  query: string, signal?: AbortSignal, opts: SearchOptions = {},
): Promise<SearchOutcome> {
  const res = await fetch(`/dictionary/search?${searchQueryString(query, opts)}`, { signal })
  if (!res.ok) return { status: 'refused' }
  return { status: 'ok', data: searchResponse.parse(await res.json()) }
}
