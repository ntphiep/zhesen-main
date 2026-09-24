import type { SupabaseClient, User } from '@supabase/supabase-js'
import { z } from '@/lib/zod'
import { alertOwner, clients } from '@/lib/admin/ssm'
import type { AwsHealthConfig } from '@/lib/admin/aws'

/**
 * The guard on every console action that stops, deletes, overwrites or runs arbitrary
 * code, agreed with the owner in #64: the target's name typed back, a sign-in within the
 * last 10 minutes, an audit row written before the action, and an email after it.
 */

export const REAUTH_SECONDS = 600

const amrSchema = z.array(z.union([
  z.object({ method: z.string(), timestamp: z.number() }),
  z.string(),
])).optional()

/** Seconds since the latest sign-in in the access token's `amr` claim, or null when the
 *  token carries none. `getClaims` verifies the token before its claims are read. */
export async function secondsSinceSignIn(supabase: SupabaseClient, now: number = Date.now()): Promise<number | null> {
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data) return null
  const amr = amrSchema.safeParse(data.claims.amr)
  if (!amr.success || !amr.data) return null
  const times = amr.data.flatMap((e) => (typeof e === 'string' ? [] : [e.timestamp]))
  return times.length ? Math.max(0, now / 1000 - Math.max(...times)) : null
}

export type Refusal = { status: number; body: { error: string; reauth?: true } }

/** Null when the action may go ahead; otherwise the answer to send instead. */
export async function checkGuard(
  supabase: SupabaseClient,
  confirm: string | undefined,
  /** Null for an action that needs only the recent sign-in. */
  target: string | null,
  now: number = Date.now(),
): Promise<Refusal | null> {
  if (target !== null && confirm !== target) {
    return { status: 409, body: { error: `Gõ đúng ${target} để xác nhận.` } }
  }
  const since = await secondsSinceSignIn(supabase, now)
  if (since === null || since > REAUTH_SECONDS) {
    return { status: 401, body: { error: 'Thao tác này cần đăng nhập lại trong 10 phút gần nhất.', reauth: true } }
  }
  return null
}

/** Writes the audit row through admin.record (0064). Throws when it cannot, so the
 *  caller never acts without a record. */
export async function record(supabase: SupabaseClient, action: string, target: string, detail: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.schema('admin').rpc('record', { p_action: action, p_target: target, p_detail: detail })
  if (error) throw new Error(`audit refused: ${error.code ?? ''}`)
}

/** The email after an action; never throws. The subject stays ASCII for SNS. */
export async function notify(cfg: AwsHealthConfig, user: Pick<User, 'email'> | null, subject: string, lines: string[]): Promise<boolean> {
  const { sns } = clients(cfg)
  const body = [...lines, '', `By: ${user?.email ?? 'rescue entry'}`, `At: ${new Date().toISOString()}`].join('\n')
  return alertOwner(sns, cfg.accountId, `zhesen admin: ${subject}`, body)
}
