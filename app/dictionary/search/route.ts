import { unstable_cache } from 'next/cache'
import { createContentClient } from '@/lib/supabase/content'
import { searchBothDirections } from '@/lib/dictionary/search'

// Cache search results server-side, keyed by the normalized query. This removes the
// per-keystroke cross-region round-trip to Supabase for any prefix anyone has typed
// before; the CDN/edge can also serve repeats via the Cache-Control header.
const cachedSearch = unstable_cache(
  (q: string) => searchBothDirections(createContentClient(), q),
  ['dict-search-all'],
  { revalidate: 3600, tags: ['lex'] },
)

const EMPTY = { forward: { en: [], zh: [], es: [] }, reverse: { en: [], zh: [], es: [] }, suggestions: [] }

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('q')?.trim() ?? ''
  if (!q) return Response.json(EMPTY)
  const data = await cachedSearch(q.toLowerCase())
  return Response.json(data, {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  })
}
