import { getCachedEntryDetail } from '@/lib/dictionary/cached'
import { clientKey, createRateLimiter } from '@/lib/http/rateLimit'

// One entry, for a client that is not the entry page: the wordlist's expanded row.
// It used to query Supabase straight from the browser, so every first expand paid the
// full round trip to Seoul for data `getCachedEntryDetail` already holds. The page at
// /dictionary/[lang]/[id] reads the same cache, so a word looked up and then expanded
// in the notebook is answered from one cached value.

// The id space is bounded by what the dictionary holds and every answer is cached, so
// this is not the cold-query budget the search route needs. It is the same per-address
// cap, for a caller feeding the route ids in a loop.
const ENTRIES_PER_MINUTE = 120
const rateLimit = createRateLimiter({ limit: ENTRIES_PER_MINUTE, windowMs: 60_000 })

// An entry id is `<lang>:<headword>`; the longest headword in the data is well inside
// this. Bounded so the cache key space stays finite.
const MAX_ID_CHARS = 128

// Same split as /dictionary/search: `s-maxage` says nothing to a browser, which would
// otherwise invent its own freshness and hold a copy revalidateTag cannot reach.
const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=0, must-revalidate',
  'CDN-Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
} as const

export async function GET(request: Request) {
  const caller = clientKey(request)
  if (caller) {
    const perCaller = rateLimit(caller)
    if (!perCaller.allowed) {
      return Response.json(
        { error: 'Đang có quá nhiều lượt dịch. Vui lòng thử lại sau ít giây.' },
        { status: 429, headers: { 'Retry-After': String(perCaller.retryAfterSeconds) } },
      )
    }
  }

  const id = new URL(request.url).searchParams.get('id')?.trim() ?? ''
  if (!id || Array.from(id).length > MAX_ID_CHARS) return Response.json(null, { headers: CACHE_HEADERS })

  return Response.json(await getCachedEntryDetail(id), { headers: CACHE_HEADERS })
}
