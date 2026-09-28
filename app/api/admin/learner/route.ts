import { z } from '@/lib/zod'
import { createClient } from '@/lib/supabase/server'
import { adminUser } from '@/lib/auth/admin'
import { flushLex } from '@/lib/admin/cache'
import { LEARNER_REFUSALS } from '@/lib/admin/learner'
import { badRequest, notFoundJson, readJson, rpcError } from '@/lib/admin/respond'

/** Hides or publishes one learner layer from /admin/learner. Either change reaches the word
 *  page, so the `lex` tag is flushed or the page keeps the old state for up to seven days. */
const requestBody = z.object({
  entryId: z.string().min(1).max(200),
  status: z.enum(['published', 'hidden']),
})

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient()
  if (!(await adminUser(supabase))) return notFoundJson()

  const body = requestBody.safeParse(await readJson(request))
  if (!body.success) return badRequest()

  const { error } = await supabase.schema('admin').rpc('learner_set_status', {
    p_entry_id: body.data.entryId, p_status: body.data.status,
  })
  if (error) return rpcError(error, LEARNER_REFUSALS)

  flushLex()
  return Response.json({ ok: true })
}
