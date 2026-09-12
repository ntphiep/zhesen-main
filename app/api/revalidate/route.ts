import { revalidateTag } from 'next/cache'

/**
 * Drops the cached dictionary reads so a pipeline load shows up immediately
 * instead of waiting out the hour-long revalidate window.
 *
 * The data pipeline lives in a separate repository and writes straight to
 * Postgres, so nothing in this app knows when the lexicon changes. Without this
 * the only options were waiting or redeploying.
 *
 *   curl -X POST https://<host>/api/revalidate -H "x-revalidate-secret: …"
 */
const TAGS = ['lex', 'content'] as const

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.REVALIDATE_SECRET
  if (!secret) {
    return Response.json({ error: 'REVALIDATE_SECRET chưa được cấu hình' }, { status: 503 })
  }
  if (request.headers.get('x-revalidate-secret') !== secret) {
    return Response.json({ error: 'Sai khoá' }, { status: 401 })
  }

  // "max" marks the tag stale and serves the old value while the new one loads,
  // which is what the docs recommend and what suits a dictionary: nobody should
  // wait on a blocking refetch just because the pipeline ran. The one-argument
  // form is deprecated in Next 16.
  for (const tag of TAGS) revalidateTag(tag, 'max')
  return Response.json({ revalidated: TAGS, at: new Date().toISOString() })
}
