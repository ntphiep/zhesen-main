import { awsHealthConfig } from '@/lib/admin/aws'
import { ALERTS_TOPIC } from '@/lib/admin/ssm'
import { formatSns, isSnsUrl, sendAlert, snsMessageSchema, verifySns } from '@/lib/admin/alerts'

/**
 * The HTTPS subscriber of SNS topic zhesen-alerts (infra/terraform/modules/alerts), which
 * forwards the alarms, the budget and bin/backup.sh to Slack and Telegram. Public, so a
 * message counts only when its signature verifies against an SNS certificate and it comes
 * from that one topic. SNS posts JSON as text/plain.
 */
const answer = (status: number) => new Response(null, { status })

export async function POST(request: Request): Promise<Response> {
  const cfg = awsHealthConfig()
  if (!cfg) return answer(503)
  let raw: unknown
  try {
    raw = JSON.parse(await request.text())
  } catch {
    return answer(400)
  }
  const parsed = snsMessageSchema.safeParse(raw)
  if (!parsed.success) return answer(400)
  const m = parsed.data
  if (m.TopicArn !== ALERTS_TOPIC(cfg.accountId) || !(await verifySns(m))) return answer(403)

  if (m.Type === 'SubscriptionConfirmation') {
    if (!m.SubscribeURL || !isSnsUrl(m.SubscribeURL)) return answer(400)
    const res = await fetch(m.SubscribeURL, { signal: AbortSignal.timeout(10_000) }).catch(() => null)
    return answer(res?.ok ? 200 : 502)
  }
  if (m.Type === 'Notification') {
    const { title, lines } = formatSns(m)
    await sendAlert(title, lines, cfg)
  }
  return answer(200)
}
