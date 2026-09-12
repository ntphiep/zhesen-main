import { searchResponse, type SearchResponse } from './response'

/**
 * One call to the cached /dictionary/search route.
 *
 * `refused` is a deliberate outcome rather than an error: the route answers with
 * a non-OK status when it rate-limits a caller, and a body that is not a result
 * set. "Không tìm thấy kết quả" would be a claim about the dictionary, and the
 * dictionary was never asked, so the caller has to be able to tell the two apart.
 */
export type SearchOutcome =
  | { status: 'ok'; data: SearchResponse }
  | { status: 'refused' }

/**
 * Search through the route rather than straight from the browser to Supabase.
 * The route holds the server-side cache, so a prefix anyone has typed before
 * costs no round trip at all, and it holds the per-address budget that keeps a
 * keystroke-per-query caller from spending the database allowance directly.
 *
 * Aborts and network failures reject; the caller decides what to show.
 */
export async function fetchSearch(query: string, signal?: AbortSignal): Promise<SearchOutcome> {
  const res = await fetch(`/dictionary/search?q=${encodeURIComponent(query.trim())}`, { signal })
  if (!res.ok) return { status: 'refused' }
  return { status: 'ok', data: searchResponse.parse(await res.json()) }
}
