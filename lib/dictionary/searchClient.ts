import { searchResponse, type SearchResponse } from './response'

/** One call to the cached /dictionary/search route. `refused` is an outcome, not an error:
 *  a rate-limited caller gets a non-OK status and no result set, and "no results found"
 *  would be a claim about a dictionary that was never asked. */
export type SearchOutcome =
  | { status: 'ok'; data: SearchResponse }
  | { status: 'refused' }

/** Search through the route, never straight from the browser to Supabase: the route holds
 *  the server-side cache and the per-address budget. Aborts and network failures reject,
 *  and the caller decides what to show. */
export async function fetchSearch(query: string, signal?: AbortSignal): Promise<SearchOutcome> {
  const res = await fetch(`/dictionary/search?q=${encodeURIComponent(query.trim())}`, { signal })
  if (!res.ok) return { status: 'refused' }
  return { status: 'ok', data: searchResponse.parse(await res.json()) }
}
