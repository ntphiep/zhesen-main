import { loadWordPage } from '@/lib/dictionary/wordPageData'
import { buildWordView } from '@/lib/dictionary/wordView'
import { splitEntryId } from '@/lib/dictionary/entryId'
import { isLangCode } from '@/lib/languages'
import { clientKey, createRateLimiter } from '@/lib/http/rateLimit'

// One word as the word page draws it, for the side-by-side layout, which opens a related
// word in a column beside the page instead of leaving it. Built from the same caches as
// the page, so a word already opened as a page costs nothing here.

// The same per-address cap as /dictionary/entry, for a caller feeding ids in a loop.
const VIEWS_PER_MINUTE = 120
const rateLimit = createRateLimiter({ limit: VIEWS_PER_MINUTE, windowMs: 60_000 })

// An entry id is `<lang>:<headword>`; bounded so the cache key space stays finite.
const MAX_ID_CHARS = 128

// `s-maxage` says nothing to a browser, which would otherwise hold a copy revalidateTag
// cannot reach.
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
        { error: 'Quá nhiều lượt tra. Thử lại sau ít giây.' },
        { status: 429, headers: { 'Retry-After': String(perCaller.retryAfterSeconds) } },
      )
    }
  }

  const id = new URL(request.url).searchParams.get('id')?.trim() ?? ''
  if (!id || Array.from(id).length > MAX_ID_CHARS || !isLangCode(splitEntryId(id).lang)) {
    return Response.json(null, { status: 404, headers: CACHE_HEADERS })
  }
  const data = await loadWordPage(id)
  return Response.json(data ? buildWordView(data) : null, { status: data ? 200 : 404, headers: CACHE_HEADERS })
}
