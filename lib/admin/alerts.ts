import { createPublicKey, createVerify, type KeyObject } from 'node:crypto'
import { GetParameterCommand, PutParameterCommand, type SSMClient } from '@aws-sdk/client-ssm'
import { z } from '@/lib/zod'
import { awsHealthConfig, type AwsHealthConfig } from '@/lib/admin/aws'
import { REGION, clients } from '@/lib/admin/ssm'

/**
 * Where the owner's alerts go: a Slack incoming webhook, a Telegram bot, or both. The
 * settings are one SecureString parameter the admin console writes; the SNS topic the
 * alarms and budget publish to reaches them through app/api/alerts/sns.
 */

export const CHANNELS_PARAMETER = '/zhesen/prod/alert_channels'

export const channelsSchema = z.object({
  slack: z.object({
    webhookUrl: z.string().regex(/^https:\/\/hooks\.slack\.com\/services\/[\w/]+$/, 'The Slack webhook URL must start with https://hooks.slack.com/services/.'),
  }).optional(),
  telegram: z.object({
    botToken: z.string().regex(/^\d+:[\w-]{30,}$/, 'The Telegram bot token looks like 123456789:AA… as BotFather gives it.'),
    chatId: z.string().regex(/^(-?\d+|@\w{5,})$/, 'The Telegram chat id is a number, or @name for a public channel.'),
  }).optional(),
})
export type AlertChannels = z.infer<typeof channelsSchema>

export async function readChannels(ssm: SSMClient): Promise<AlertChannels> {
  try {
    const out = await ssm.send(new GetParameterCommand({ Name: CHANNELS_PARAMETER, WithDecryption: true }))
    return channelsSchema.parse(JSON.parse(out.Parameter?.Value ?? '{}'))
  } catch (e) {
    if (e instanceof Error && e.name === 'ParameterNotFound') return {}
    throw e
  }
}

export async function writeChannels(ssm: SSMClient, channels: AlertChannels): Promise<void> {
  await ssm.send(new PutParameterCommand({
    Name: CHANNELS_PARAMETER, Value: JSON.stringify(channelsSchema.parse(channels)), Type: 'SecureString', Overwrite: true,
  }))
}

const tail = (s: string) => `…${s.slice(-4)}`

/** What the browser may see: the last four characters of each secret. A chat id alone
 *  cannot send anything. */
export function maskChannels(c: AlertChannels) {
  return {
    slack: c.slack ? { webhookUrl: tail(c.slack.webhookUrl) } : null,
    telegram: c.telegram ? { botToken: tail(c.telegram.botToken), chatId: c.telegram.chatId } : null,
  }
}

export interface ChannelResult {
  channel: 'slack' | 'telegram' | 'settings'
  ok: boolean
  error?: string
}

/** Telegram refuses a message over 4,096 characters. */
const TEXT_LIMIT = 4000

/** Slack reads &, < and > as markup (docs.slack.dev/messaging/formatting-message-text). */
const slackEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** One POST per configured channel, in parallel. Never throws; an error names the HTTP
 *  status and the service's own short reason, never the URL, which carries the secret. */
export async function deliver(channels: AlertChannels, title: string, lines: string[]): Promise<ChannelResult[]> {
  const text = [title, ...lines].join('\n').slice(0, TEXT_LIMIT)
  const posts: [ChannelResult['channel'], string, unknown][] = []
  if (channels.slack) posts.push(['slack', channels.slack.webhookUrl, { text: slackEscape(text) }])
  if (channels.telegram) {
    posts.push(['telegram', `https://api.telegram.org/bot${channels.telegram.botToken}/sendMessage`,
      { chat_id: channels.telegram.chatId, text, disable_web_page_preview: true }])
  }
  return Promise.all(posts.map(async ([channel, url, body]): Promise<ChannelResult> => {
    try {
      const res = await fetch(url, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000),
      })
      if (res.ok) return { channel, ok: true }
      const reason = (await res.text().catch(() => '')).slice(0, 160)
      return { channel, ok: false, error: `HTTP ${res.status}${reason ? `: ${reason}` : ''}` }
    } catch (e) {
      return { channel, ok: false, error: e instanceof Error ? e.name : 'Error' }
    }
  }))
}

/** Every configured channel. Never throws: a failed alert must not undo an action that has
 *  already run. Without AWS access there are no settings to read, so nothing is sent. */
export async function sendAlert(title: string, lines: string[], cfg: AwsHealthConfig | null = awsHealthConfig()): Promise<ChannelResult[]> {
  if (!cfg) return []
  try {
    return await deliver(await readChannels(clients(cfg).ssm), title, lines)
  } catch (e) {
    return [{ channel: 'settings', ok: false, error: e instanceof Error ? e.name : 'Error' }]
  }
}

// SNS HTTPS delivery, verified as in
// https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html

export const snsMessageSchema = z.object({
  Type: z.enum(['Notification', 'SubscriptionConfirmation', 'UnsubscribeConfirmation']),
  MessageId: z.string(),
  TopicArn: z.string(),
  Subject: z.string().nullish(),
  Message: z.string(),
  Timestamp: z.string(),
  SignatureVersion: z.enum(['1', '2']),
  Signature: z.string(),
  SigningCertURL: z.string(),
  SubscribeURL: z.string().optional(),
  Token: z.string().optional(),
})
export type SnsMessage = z.infer<typeof snsMessageSchema>

/** The topic lives in this region, so its certificate and confirmation links do too. */
export function isSnsUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.hostname === `sns.${REGION}.amazonaws.com` && u.port === ''
  } catch {
    return false
  }
}

const SIGNED_KEYS = {
  Notification: ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type'],
  SubscriptionConfirmation: ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'],
  UnsubscribeConfirmation: ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'],
} as const

export function stringToSign(m: SnsMessage): string {
  return SIGNED_KEYS[m.Type].map((k) => (m[k] == null ? '' : `${k}\n${m[k]}\n`)).join('')
}

/** One fetch per certificate per function instance; a failed fetch is not kept. */
const certificates = new Map<string, Promise<KeyObject>>()

/** createPublicKey reads the key out of an X.509 certificate PEM. */
function certificate(url: string): Promise<KeyObject> {
  let cert = certificates.get(url)
  if (!cert) {
    cert = fetch(url, { signal: AbortSignal.timeout(5000) }).then(async (res) => {
      if (!res.ok) throw new Error(`certificate HTTP ${res.status}`)
      return createPublicKey(await res.text())
    })
    cert.catch(() => certificates.delete(url))
    certificates.set(url, cert)
  }
  return cert
}

export async function verifySns(m: SnsMessage): Promise<boolean> {
  if (!isSnsUrl(m.SigningCertURL) || !new URL(m.SigningCertURL).pathname.endsWith('.pem')) return false
  try {
    const key = await certificate(m.SigningCertURL)
    return createVerify(m.SignatureVersion === '1' ? 'RSA-SHA1' : 'RSA-SHA256')
      .update(stringToSign(m), 'utf8')
      .verify(key, m.Signature, 'base64')
  } catch {
    return false
  }
}

const alarmSchema = z.object({
  AlarmName: z.string(),
  AlarmDescription: z.string().nullish(),
  NewStateValue: z.string(),
  OldStateValue: z.string().optional(),
  NewStateReason: z.string(),
  StateChangeTime: z.string(),
})

/** AWS Budgets writes a letter; these lines of it carry the numbers. */
const BUDGET_LINE = /^(Budget Name|Budgeted Amount|Alert Type|Alert Threshold|ACTUAL Amount|FORECASTED Amount):/

/** A CloudWatch alarm arrives as JSON, everything else on the topic as text. */
export function formatSns(m: Pick<SnsMessage, 'Subject' | 'Message' | 'Timestamp'>): { title: string; lines: string[] } {
  let json: unknown = null
  try {
    json = JSON.parse(m.Message)
  } catch {
    // Text, handled below.
  }
  const alarm = alarmSchema.safeParse(json)
  if (alarm.success) {
    const a = alarm.data
    return {
      title: `${a.NewStateValue}: ${a.AlarmName}`,
      lines: [
        ...(a.AlarmDescription ? [a.AlarmDescription] : []),
        `Reason: ${a.NewStateReason}`,
        ...(a.OldStateValue ? [`Was: ${a.OldStateValue}`] : []),
        `At: ${a.StateChangeTime}`,
      ],
    }
  }
  const title = m.Subject?.trim() || 'AWS notification'
  const text = m.Message.trim().split('\n').map((l) => l.trim())
  const budget = title.startsWith('AWS Budgets') ? text.filter((l) => BUDGET_LINE.test(l)) : []
  return { title, lines: [...(budget.length ? budget : text), `At: ${m.Timestamp}`] }
}
