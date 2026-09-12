import { unstable_cache } from 'next/cache'
import { createContentClient } from '@/lib/supabase/content'
import { searchBothDirections } from '@/lib/dictionary/search'
import { clientKey, createColdQueryLimiter, createRateLimiter } from '@/lib/http/rate-limit'

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
// That is what this caps, rather than request count: repeats are free to answer
// and stay free here, while the number of new queries per minute is bounded
// whatever headers the caller sends.
//
// The number has to sit below what the server can actually serve or it caps
// nothing. Measured against a local `next start`, a flood of new queries got 210
// through in 61 seconds -- each one waits on Supabase -- so a budget of 600 would
// never once have been reached. 180 binds, and still leaves roughly three new
// queries a second: a typist behind a 200ms debounce produces at most five, only
// for prefixes nobody has searched before, so ordinary use never approaches it.
//
// Configurable because the right number depends on what the deployment can serve,
// and because a low value is the only way to exercise this path end to end: a
// flood cannot reach 180 on a laptop, since every new query waits on Supabase.
const COLD_QUERIES_PER_MINUTE = Number(process.env.COLD_QUERIES_PER_MINUTE) || 180
const admitColdQuery = createColdQueryLimiter({ limit: COLD_QUERIES_PER_MINUTE, windowMs: 60_000 })

// A second, per-address cap, active only where `clientKey` can actually identify
// a caller — that is, behind a proxy the deployment vouches for. Without one it
// would be both bypassable and, for callers with no header at all, a single
// budget shared by every visitor.
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

function tooFast(retryAfterSeconds: number): Response {
  return Response.json(
    { error: 'Đang có quá nhiều lượt tra cứu. Vui lòng thử lại sau ít giây.' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
  )
}

export async function GET(request: Request) {
  const caller = clientKey(request)
  if (caller) {
    const perCaller = rateLimit(caller)
    if (!perCaller.allowed) return tooFast(perCaller.retryAfterSeconds)
  }

  const q = truncate(new URL(request.url).searchParams.get('q')?.trim() ?? '')
  if (!q) return Response.json(EMPTY)

  const key = q.toLowerCase()
  const cold = admitColdQuery(key)
  if (!cold.allowed) return tooFast(cold.retryAfterSeconds)

  const data = await cachedSearch(key)
  return Response.json(data, { headers: CACHE_HEADERS })
}
