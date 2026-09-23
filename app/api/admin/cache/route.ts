import { createClient } from '@/lib/supabase/server'
import { adminUser } from '@/lib/auth/admin'
import { flushLex, LEX_TAG } from '@/lib/admin/cache'
import { notFoundJson } from '@/lib/admin/respond'

/** The flush button on /admin. `/api/revalidate` stays the pipeline's, behind its secret. */
export async function POST(): Promise<Response> {
  const supabase = await createClient()
  if (!(await adminUser(supabase))) return notFoundJson()
  flushLex()
  return Response.json({ revalidated: [LEX_TAG], at: new Date().toISOString() })
}
