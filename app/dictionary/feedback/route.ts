import { createHash } from 'node:crypto'
import { z } from '@/lib/zod'
import { clientKey, createRateLimiter } from '@/lib/http/rateLimit'
import { createClient } from '@/lib/supabase/server'
import { FEEDBACK_KINDS, FEEDBACK_MESSAGE_MAX, FEEDBACK_SUGGESTION_MAX } from '@/lib/dictionary/feedback'

/**
 * A report from the word page that a meaning or an example is wrong, kept in
 * `public.word_feedback` for /admin/feedback. Signed in or not. The RPC runs with the
 * caller's own session, so it attaches the account itself, and it keeps its own hourly caps
 * (supabase/migrations/0095_word_feedback.sql) because the anon key can call it directly.
 */

// A reader who reports ten words in an hour is already the most active one there is.
const REQUESTS_PER_HOUR = 10
const rateLimit = createRateLimiter({ limit: REQUESTS_PER_HOUR, windowMs: 3_600_000 })

const requestBody = z.object({
  entryId: z.string().min(1).max(200),
  senseId: z.string().min(1).max(200).nullable(),
  kind: z.enum(FEEDBACK_KINDS),
  message: z.string().trim().min(1).max(FEEDBACK_MESSAGE_MAX),
  suggestion: z.string().trim().max(FEEDBACK_SUGGESTION_MAX).nullable(),
})

/** Groups one caller's reports for the rate limit. An unsalted hash of an address can be
 *  reversed, so it is only as private as the table, which no API role can read. */
const hashKey = (key: string) => createHash('sha256').update(key, 'utf8').digest('hex').slice(0, 32)

const tooMany = (retryAfterSeconds: number) => Response.json(
  { error: 'Chưa gửi được. Thử lại sau.' },
  { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
)

export async function POST(request: Request) {
  const caller = clientKey(request)
  if (caller) {
    const perCaller = rateLimit(caller)
    if (!perCaller.allowed) return tooMany(perCaller.retryAfterSeconds)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 400 })
  }
  const parsed = requestBody.safeParse(body)
  if (!parsed.success) return Response.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 400 })

  const { entryId, senseId, kind, message, suggestion } = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.rpc('submit_word_feedback', {
    p_entry_id: entryId,
    p_sense_id: senseId,
    p_kind: kind,
    p_message: message,
    p_proposed: suggestion || null,
    p_ip_hash: caller ? hashKey(caller) : null,
  })
  if (error) {
    if (error.message === 'rate_limited') return tooMany(3600)
    if (error.message === 'no_such_entry' || error.message === 'no_such_sense') {
      return Response.json({ error: 'Không tìm thấy từ.' }, { status: 400 })
    }
    return Response.json({ error: 'Chưa gửi được. Thử lại.' }, { status: 502 })
  }
  return Response.json({ ok: true })
}
