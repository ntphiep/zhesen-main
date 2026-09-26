import { createClient } from '@/lib/supabase/server'
import { adminUser } from '@/lib/auth/admin'
import { z } from '@/lib/zod'
import { awsHealthConfig } from '@/lib/admin/aws'
import { clients } from '@/lib/admin/ssm'
import { CHANNELS_PARAMETER, channelsSchema, deliver, maskChannels, readChannels, writeChannels, type AlertChannels } from '@/lib/admin/alerts'
import { checkGuard, record } from '@/lib/admin/guard'
import { badRequest, notFoundJson, readJson } from '@/lib/admin/respond'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE })

const filled = z.string().trim().min(1)

/** A channel left out is kept, null removes it, and a Telegram field left out keeps the
 *  saved one, so the owner never has to paste a secret back to change the other field. */
const body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('save'),
    slack: z.object({ webhookUrl: filled }).nullable().optional(),
    telegram: z.object({ botToken: filled.optional(), chatId: filled.optional() }).nullable().optional(),
  }),
  z.object({ action: z.literal('test') }),
])

function awsFailure(e: unknown): Response {
  const name = e instanceof Error ? e.name : 'Error'
  return json({ error: `AWS refused or did not answer (${name}).` }, 502)
}

const change = (patch: unknown) => (patch === undefined ? 'kept' : patch === null ? 'removed' : 'set')

/** The saved channels, secrets masked. */
export async function GET(): Promise<Response> {
  const supabase = await createClient()
  if (!(await adminUser(supabase))) return notFoundJson()
  const cfg = awsHealthConfig()
  if (!cfg) return json({ enabled: false })
  try {
    return json(maskChannels(await readChannels(clients(cfg).ssm)))
  } catch (e) {
    return awsFailure(e)
  }
}

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient()
  const user = await adminUser(supabase)
  if (!user) return notFoundJson()
  const parsed = body.safeParse(await readJson(request))
  if (!parsed.success) return badRequest()
  const b = parsed.data

  const cfg = awsHealthConfig()
  if (!cfg) return json({ error: 'AWS access is not configured for this deployment (AWS_ROLE_ARN).' }, 503)
  const { ssm } = clients(cfg)

  let current: AlertChannels
  try {
    current = await readChannels(ssm)
  } catch (e) {
    return awsFailure(e)
  }

  if (b.action === 'test') {
    if (!current.slack && !current.telegram) return json({ error: 'No channel is set up yet.' }, 409)
    const results = await deliver(current, 'zhesen: test alert', [`Sent from /admin/infra by ${user.email ?? user.id}.`, `At: ${new Date().toISOString()}`])
    return json({ results })
  }

  // Whoever can redirect the alerts can silence them, so this takes the same fresh sign-in
  // as the actions they report on.
  const refusal = await checkGuard(supabase, undefined, null)
  if (refusal) return json(refusal.body, refusal.status)

  const next: Record<string, unknown> = { ...current }
  if (b.slack === null) delete next.slack
  else if (b.slack) next.slack = b.slack
  if (b.telegram === null) delete next.telegram
  else if (b.telegram) next.telegram = { ...current.telegram, ...b.telegram }
  const valid = channelsSchema.safeParse(next)
  if (!valid.success) return json({ error: valid.error.issues[0]?.message ?? 'Invalid settings.' }, 400)

  try {
    await record(supabase, 'infra.alert_channels', CHANNELS_PARAMETER, { slack: change(b.slack), telegram: change(b.telegram) })
  } catch {
    return json({ error: 'The audit row could not be written, so nothing was changed.' }, 502)
  }
  try {
    await writeChannels(ssm, valid.data)
  } catch (e) {
    return awsFailure(e)
  }
  // Told on the channels it had before, so a change the owner did not make still reaches them.
  await deliver(current, 'zhesen admin: alert channels changed', [
    `Slack ${change(b.slack)}, Telegram ${change(b.telegram)}.`, `By: ${user.email ?? user.id}`, `At: ${new Date().toISOString()}`,
  ])
  return json(maskChannels(valid.data))
}
