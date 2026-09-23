import { z } from '@/lib/zod'
import { createClient } from '@/lib/supabase/server'
import { adminUser } from '@/lib/auth/admin'
import { flushLex } from '@/lib/admin/cache'
import { CONTENT_REFUSALS } from '@/lib/admin/content'
import { badRequest, notFoundJson, readJson, rpcError } from '@/lib/admin/respond'

/** Sense edits and entry flags from /admin/content. A sense edit flushes the `lex` tag, or
 *  the dictionary keeps serving the old text for up to seven days; a flag is never public. */
const requestBody = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('update_sense'),
    senseId: z.string().min(1).max(200),
    glossVi: z.string().max(2000).nullable(),
    glossEn: z.string().max(2000).nullable(),
  }),
  z.object({
    action: z.literal('flag'),
    entryId: z.string().min(1).max(200),
    reason: z.string().max(500).nullable(),
  }),
])

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient()
  if (!(await adminUser(supabase))) return notFoundJson()

  const body = requestBody.safeParse(await readJson(request))
  if (!body.success) return badRequest()
  const b = body.data

  const admin = supabase.schema('admin')
  const { error } = b.action === 'update_sense'
    ? await admin.rpc('update_sense', { p_sense: b.senseId, p_gloss_vi: b.glossVi, p_gloss_en: b.glossEn })
    : await admin.rpc('flag_entry', { p_entry: b.entryId, p_reason: b.reason })
  if (error) return rpcError(error, CONTENT_REFUSALS)

  if (b.action === 'update_sense') flushLex()
  return Response.json({ ok: true })
}
