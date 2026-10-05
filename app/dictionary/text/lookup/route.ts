import { z } from '@/lib/zod'
import { createContentClient } from '@/lib/supabase/content'
import { lookUpText } from '@/lib/dictionary/textLookup'
import { clientKey, createRateLimiter } from '@/lib/http/rateLimit'

/**
 * Word-by-word lookup of a phrase, a sentence or a paragraph.
 *
 * A segment below the page it serves, because a route handler and a page cannot share
 * one path. POST, not GET: the body is a passage the learner pasted, so it is neither short enough
 * for a query string nor repeated often enough for a cache keyed on it to ever hit. The
 * queries underneath are the same ones the entry page runs for its example sentences.
 */

// Each call resolves every distinct word in the passage, so it costs more than a search.
// A learner pastes a paragraph, reads it, pastes another: single figures a minute.
const PASSAGES_PER_MINUTE = 30
const rateLimit = createRateLimiter({ limit: PASSAGES_PER_MINUTE, windowMs: 60_000 })

// The same ceiling as the `translate` task, because the two layers read the same passage
// and a text one layer refuses is a text the page cannot finish answering.
const requestBody = z.object({
  text: z.string().trim().min(1).max(1000),
  lang: z.enum(['en', 'es', 'zh']).optional(),
})

export async function POST(request: Request) {
  const caller = clientKey(request)
  if (caller) {
    const perCaller = rateLimit(caller)
    if (!perCaller.allowed) {
      return Response.json(
        { error: 'Quá nhiều lượt dịch. Thử lại sau ít giây.' },
        { status: 429, headers: { 'Retry-After': String(perCaller.retryAfterSeconds) } },
      )
    }
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 400 })
  }

  const parsed = requestBody.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Đoạn văn bản quá dài hoặc để trống.' }, { status: 400 })
  }

  const { text, lang } = parsed.data
  const client = createContentClient()
  return Response.json(await (lang ? lookUpText(client, text, lang) : lookUpText(client, text)))
}
