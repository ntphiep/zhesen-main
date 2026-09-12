import { unstable_cache } from 'next/cache'
import { createContentClient } from '@/lib/supabase/content'
import { searchBothDirections } from '@/lib/dictionary/search'
import { clientKey, createRateLimiter } from '@/lib/http/rate-limit'

// Cache search results server-side, keyed by the normalized query. This removes the
// per-keystroke cross-region round-trip to Supabase for any prefix anyone has typed
// before; the CDN/edge can also serve repeats via the Cache-Control header.
const cachedSearch = unstable_cache(
  (q: string) => searchBothDirections(createContentClient(), q),
  ['dict-search-all'],
  { revalidate: 3600, tags: ['lex'] },
)

// Only a query the cache has never seen reaches Supabase, so a caller feeding the
// route random strings misses every time and spends the database budget directly.
// A typist behind a 200ms debounce produces a few searches a second at worst, so
// this leaves ordinary use untouched. Behind a host that does not set a forwarding
// header every caller shares the "unknown" bucket; see `clientKey`.
const SEARCHES_PER_MINUTE = 120
const rateLimit = createRateLimiter({ limit: SEARCHES_PER_MINUTE, windowMs: 60_000 })

// Long enough for a pasted phrase, short enough that the cache key space stays
// finite. Counted in code points so a cut never lands inside a surrogate pair and
// leaves half a character behind.
const MAX_QUERY_CHARS = 64

const EMPTY = { forward: { en: [], zh: [], es: [] }, reverse: { en: [], zh: [], es: [] }, suggestions: [] }

// The two caches are told different things on purpose. The previous header gave
// only `s-maxage`, which says nothing to a browser, so browsers applied heuristic
// freshness and kept answering from their own copy: after the pipeline loaded new
// data and /api/revalidate cleared the server cache, a returning visitor still saw
// the old results, and nothing here could reach that copy. `max-age=0,
// must-revalidate` makes the browser ask every time, which is cheap because the
// server answer comes from `cachedSearch`. The shared cache keeps the long window.
const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=0, must-revalidate',
  'CDN-Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
} as const

function truncate(q: string): string {
  const chars = Array.from(q)
  return chars.length <= MAX_QUERY_CHARS ? q : chars.slice(0, MAX_QUERY_CHARS).join('')
}

export async function GET(request: Request) {
  const limit = rateLimit(clientKey(request))
  if (!limit.allowed) {
    return Response.json(
      { error: 'Bạn tra cứu quá nhanh. Vui lòng thử lại sau ít giây.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    )
  }

  const q = truncate(new URL(request.url).searchParams.get('q')?.trim() ?? '')
  if (!q) return Response.json(EMPTY)
  const data = await cachedSearch(q.toLowerCase())
  return Response.json(data, { headers: CACHE_HEADERS })
}
