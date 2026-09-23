import { z } from '@/lib/zod'
import { createClient } from '@/lib/supabase/server'
import { adminUser } from '@/lib/auth/admin'
import { ACCOUNT_REFUSALS } from '@/lib/admin/users'
import { badRequest, notFoundJson, readJson, rpcError } from '@/lib/admin/respond'

/** Deleting and merging accounts from /admin/users. The database checks the role again
 *  and writes the audit row (supabase/migrations/0059_admin_account_actions.sql). */
const requestBody = z.discriminatedUnion('action', [
  z.object({ action: z.literal('delete'), id: z.uuid(), confirm: z.string().max(320) }),
  z.object({ action: z.literal('merge'), from: z.uuid(), into: z.uuid() }),
])

const deleted = z.object({ deleted: z.string(), words: z.number() })
const merged = z.object({ moved: z.number(), kept: z.number(), days: z.number() })

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient()
  if (!(await adminUser(supabase))) return notFoundJson()

  const body = requestBody.safeParse(await readJson(request))
  if (!body.success) return badRequest()
  const b = body.data

  const admin = supabase.schema('admin')
  if (b.action === 'delete') {
    const { data, error } = await admin.rpc('delete_account', { p_user: b.id, p_confirm: b.confirm })
    if (error) return rpcError(error, ACCOUNT_REFUSALS)
    return Response.json(deleted.parse(data))
  }
  const { data, error } = await admin.rpc('merge_account', { p_from: b.from, p_into: b.into })
  if (error) return rpcError(error, ACCOUNT_REFUSALS)
  return Response.json(merged.parse(data))
}
