import { searchResponse, type SearchResponse } from './response'
import { LANG_CODES, type LangCode } from '@/lib/languages'

/** One call to the cached /dictionary/search route. `refused` is an outcome, not an error:
 *  the route answered with a status and no result set, and "no results found" would be a
 *  claim about a dictionary that was never asked. The message comes from the route,
 *  because a rate limit and a cold database are different things to be told. */
export type SearchOutcome =
  | { status: 'ok'; data: SearchResponse }
  | { status: 'refused'; message: string }

/** Shown when the route answers a status with no body to explain it, which is what a
 *  proxy or an edge failure looks like from here. */
export const REFUSED_MESSAGE = 'Chưa tra cứu được. Vui lòng thử lại sau ít giây.'

export interface SearchOptions {
  /** Which languages to translate into. Omitted means all three. */
  langs?: readonly LangCode[]
  /** The learner said the query is Vietnamese, so run that direction whatever the
   *  forward search scored. */
  vietnamese?: boolean
}

/** The query string the route reads. Exported because the search box keys its own
 *  in-memory cache on it, and the two must agree on what makes a request distinct. */
export function searchQueryString(query: string, opts: SearchOptions = {}): string {
  const langs = opts.langs ?? LANG_CODES
  const params = new URLSearchParams({ q: query.trim() })
  if (langs.length !== LANG_CODES.length) params.set('langs', langs.join(','))
  if (opts.vietnamese) params.set('vi', '1')
  return params.toString()
}

/** Search through the route, never straight from the browser to Supabase: the route holds
 *  the server-side cache and the per-address budget. Aborts and network failures reject,
 *  and the caller decides what to show. */
export async function fetchSearch(
  query: string, signal?: AbortSignal, opts: SearchOptions = {},
): Promise<SearchOutcome> {
  const res = await fetch(`/dictionary/search?${searchQueryString(query, opts)}`, { signal })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const message = (body as { error?: unknown } | null)?.error
    return { status: 'refused', message: typeof message === 'string' ? message : REFUSED_MESSAGE }
  }
  return { status: 'ok', data: searchResponse.parse(await res.json()) }
}
