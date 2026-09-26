import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSign, generateKeyPairSync } from 'node:crypto'
import { GetParameterCommand, PutParameterCommand } from '@aws-sdk/client-ssm'

const { adminUser, rpc, getClaims, send } = vi.hoisted(() => ({
  adminUser: vi.fn(),
  rpc: vi.fn(),
  getClaims: vi.fn(),
  send: vi.fn(),
}))
vi.mock('@/lib/auth/admin', () => ({ adminUser }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ schema: () => ({ rpc }), auth: { getClaims } }),
}))
vi.mock('@/lib/admin/ssm', async (orig) => ({
  ...(await orig<typeof import('@/lib/admin/ssm')>()),
  clients: () => ({ ssm: { send }, ec2: {}, sns: {} }),
}))

import {
  channelsSchema, deliver, formatSns, maskChannels, sendAlert, stringToSign, verifySns, type SnsMessage,
} from '@/lib/admin/alerts'
import { GET as getAlerts, POST as postAlerts } from '@/app/api/admin/alerts/route'
import { POST as snsPost } from '@/app/api/alerts/sns/route'

const ACCOUNT = '014498663963'
const ROLE = `arn:aws:iam::${ACCOUNT}:role/zhesen-vercel-health`
const TOPIC = `arn:aws:sns:ap-northeast-2:${ACCOUNT}:zhesen-alerts`
const SLACK = 'https://hooks.slack.com/services/T0001/B0002/abcdefghijklmnopqrstwxyz'
const TOKEN = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw9'
const CHANNELS = { slack: { webhookUrl: SLACK }, telegram: { botToken: TOKEN, chatId: '-1001234567890' } }

const CERT_URL = 'https://sns.ap-northeast-2.amazonaws.com/SimpleNotificationService-test.pem'
const SUBSCRIBE_URL = `https://sns.ap-northeast-2.amazonaws.com/?Action=ConfirmSubscription&TopicArn=${TOPIC}&Token=abc`
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 })
const publicPem = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString()

let stored: string | null = null
let fetchMock: ReturnType<typeof vi.fn>

function signed(fields: Partial<SnsMessage> & Pick<SnsMessage, 'Type' | 'Message'>, version: '1' | '2' = '2'): SnsMessage {
  const m: SnsMessage = {
    MessageId: 'm-1', TopicArn: TOPIC, Timestamp: '2026-09-26T03:00:00.000Z',
    SignatureVersion: version, SigningCertURL: CERT_URL, Signature: '', ...fields,
  }
  return { ...m, Signature: createSign(version === '1' ? 'RSA-SHA1' : 'RSA-SHA256').update(stringToSign(m)).sign(keys.privateKey, 'base64') }
}

const bodyOf = (url: string) => {
  const call = fetchMock.mock.calls.find(([u]) => String(u) === url)
  return call ? JSON.parse(String((call[1] as RequestInit).body)) : undefined
}

beforeEach(() => {
  process.env.AWS_ROLE_ARN = ROLE
  stored = JSON.stringify(CHANNELS)
  send.mockReset().mockImplementation(async (cmd: unknown) => {
    if (cmd instanceof GetParameterCommand) {
      if (stored === null) throw Object.assign(new Error('not found'), { name: 'ParameterNotFound' })
      return { Parameter: { Value: stored } }
    }
    if (cmd instanceof PutParameterCommand) {
      stored = cmd.input.Value ?? null
      return {}
    }
    throw new Error('unexpected command')
  })
  fetchMock = vi.fn(async (url: string | URL) => {
    const u = String(url)
    if (u === CERT_URL) return new Response(publicPem)
    if (u === SUBSCRIBE_URL) return new Response('<ConfirmSubscriptionResponse/>')
    return new Response('ok')
  })
  vi.stubGlobal('fetch', fetchMock)
  adminUser.mockReset().mockResolvedValue({ id: 'admin', email: 'owner@example.com' })
  rpc.mockReset().mockResolvedValue({ data: null, error: null })
  getClaims.mockReset().mockResolvedValue({ data: { claims: { amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) - 60 }] } }, error: null })
})
afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.AWS_ROLE_ARN
})

describe('alert channel settings', () => {
  it('accepts a Slack incoming webhook and a Telegram bot, and nothing else', () => {
    expect(channelsSchema.safeParse(CHANNELS).success).toBe(true)
    expect(channelsSchema.safeParse({}).success).toBe(true)
    for (const webhookUrl of ['http://hooks.slack.com/services/T/B/x', 'https://example.com/services/T/B/x', 'https://hooks.slack.com.evil.io/services/T/B/x']) {
      expect(channelsSchema.safeParse({ slack: { webhookUrl } }).success).toBe(false)
    }
    expect(channelsSchema.safeParse({ telegram: { botToken: 'nope', chatId: '1' } }).success).toBe(false)
    expect(channelsSchema.safeParse({ telegram: { botToken: TOKEN, chatId: 'general' } }).success).toBe(false)
  })

  it('masks every secret down to its last four characters', () => {
    const masked = maskChannels(CHANNELS)
    expect(masked).toEqual({ slack: { webhookUrl: '…wxyz' }, telegram: { botToken: '…saw9', chatId: '-1001234567890' } })
    expect(JSON.stringify(masked)).not.toContain('abcdefgh')
    expect(JSON.stringify(masked)).not.toContain('AAHdq')
    expect(maskChannels({})).toEqual({ slack: null, telegram: null })
  })
})

describe('deliver and sendAlert', () => {
  it('posts the Slack webhook JSON and the Telegram sendMessage body', async () => {
    const results = await deliver(CHANNELS, 'zhesen admin: infra.stop', ['a < b & c'])
    expect(results).toEqual([{ channel: 'slack', ok: true }, { channel: 'telegram', ok: true }])
    expect(bodyOf(SLACK)).toEqual({ text: 'zhesen admin: infra.stop\na &lt; b &amp; c' })
    expect(bodyOf(`https://api.telegram.org/bot${TOKEN}/sendMessage`)).toEqual({
      chat_id: '-1001234567890', text: 'zhesen admin: infra.stop\na < b & c', disable_web_page_preview: true,
    })
  })

  it('reports a refusal or a network failure per channel, without the secret, and never throws', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === SLACK) return new Response('no_service', { status: 404 })
      throw Object.assign(new Error(`connect ${url}`), { name: 'TypeError' })
    })
    const results = await deliver(CHANNELS, 't', [])
    expect(results).toEqual([
      { channel: 'slack', ok: false, error: 'HTTP 404: no_service' },
      { channel: 'telegram', ok: false, error: 'TypeError' },
    ])
    expect(JSON.stringify(results)).not.toContain(TOKEN)
  })

  it('reads the channels from SSM and sends nothing when none are set', async () => {
    expect(await sendAlert('t', [])).toHaveLength(2)
    stored = null
    fetchMock.mockClear()
    expect(await sendAlert('t', [])).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not throw when SSM cannot be read or AWS is not configured', async () => {
    send.mockRejectedValue(Object.assign(new Error('denied'), { name: 'AccessDeniedException' }))
    expect(await sendAlert('t', [])).toEqual([{ channel: 'settings', ok: false, error: 'AccessDeniedException' }])
    expect(await sendAlert('t', [], null)).toEqual([])
  })
})

describe('SNS signature', () => {
  const note = { Type: 'Notification' as const, Subject: 'hello', Message: 'body' }

  it('accepts SignatureVersion 1 and 2 signed with the certificate at an SNS URL', async () => {
    expect(await verifySns(signed(note, '2'))).toBe(true)
    expect(await verifySns(signed(note, '1'))).toBe(true)
    expect(await verifySns(signed({ Type: 'SubscriptionConfirmation', Message: 'confirm', SubscribeURL: SUBSCRIBE_URL, Token: 'abc' }))).toBe(true)
  })

  it('rejects a changed message and a signature over another one', async () => {
    expect(await verifySns({ ...signed(note), Message: 'forged' })).toBe(false)
    expect(await verifySns({ ...signed(note), Signature: signed({ ...note, Message: 'other' }).Signature })).toBe(false)
  })

  it('rejects a certificate that is not on the SNS host of this region, without fetching it', async () => {
    fetchMock.mockClear()
    for (const url of [
      'http://sns.ap-northeast-2.amazonaws.com/x.pem',
      'https://sns.us-east-1.amazonaws.com/x.pem',
      'https://sns.ap-northeast-2.amazonaws.com.evil.io/x.pem',
      'https://evil.io/sns.ap-northeast-2.amazonaws.com/x.pem',
      'https://sns.ap-northeast-2.amazonaws.com/x.txt',
    ]) {
      expect(await verifySns({ ...signed(note), SigningCertURL: url })).toBe(false)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('formatSns', () => {
  it('puts a CloudWatch alarm into its name, state, reason and time', () => {
    const alarm = {
      AlarmName: 'zhesen-cpu-high', AlarmDescription: 'CPU above 80% for 15 minutes', NewStateValue: 'ALARM', OldStateValue: 'OK',
      NewStateReason: 'Threshold Crossed: 3 datapoints were greater than the threshold (80.0).', StateChangeTime: '2026-09-26T03:00:00.000+0000',
    }
    expect(formatSns({ Subject: 'ALARM: "zhesen-cpu-high"', Message: JSON.stringify(alarm), Timestamp: 't' })).toEqual({
      title: 'ALARM: zhesen-cpu-high',
      lines: ['CPU above 80% for 15 minutes', `Reason: ${alarm.NewStateReason}`, 'Was: OK', 'At: 2026-09-26T03:00:00.000+0000'],
    })
  })

  it('keeps the figures of an AWS Budgets letter and the whole of any other text', () => {
    const letter = 'AWS Budget Notification September 26, 2026\nAWS Account 014498663963\n\nDear AWS Customer,\n\nYou requested an alert.\n\n'
      + 'Budget Name: zhesen-ap-northeast-2-monthly\nBudget Type: Cost\nBudgeted Amount: $45.00\nAlert Type: ACTUAL\nAlert Threshold: > $36.00\nACTUAL Amount: $37.12\n'
    expect(formatSns({ Subject: 'AWS Budgets: zhesen-ap-northeast-2-monthly has exceeded your alert threshold', Message: letter, Timestamp: 'T' }).lines).toEqual([
      'Budget Name: zhesen-ap-northeast-2-monthly', 'Budgeted Amount: $45.00', 'Alert Type: ACTUAL', 'Alert Threshold: > $36.00', 'ACTUAL Amount: $37.12', 'At: T',
    ])
    expect(formatSns({ Subject: null, Message: 'backup failed\nexit 1', Timestamp: 'T' })).toEqual({ title: 'AWS notification', lines: ['backup failed', 'exit 1', 'At: T'] })
  })
})

describe('POST /api/alerts/sns', () => {
  const deliver = (m: SnsMessage) => snsPost(new Request('https://zhesen-main.vercel.app/api/alerts/sns', {
    method: 'POST', headers: { 'content-type': 'text/plain; charset=UTF-8' }, body: JSON.stringify(m),
  }))
  const slackCalls = () => fetchMock.mock.calls.filter(([u]) => String(u) === SLACK)

  it('confirms its subscription by fetching the SubscribeURL', async () => {
    const res = await deliver(signed({ Type: 'SubscriptionConfirmation', Message: 'confirm', SubscribeURL: SUBSCRIBE_URL, Token: 'abc' }))
    expect(res.status).toBe(200)
    expect(fetchMock.mock.calls.some(([u]) => String(u) === SUBSCRIBE_URL)).toBe(true)
  })

  it('forwards a signed alarm from the topic to the channels', async () => {
    const alarm = { AlarmName: 'zhesen-disk', NewStateValue: 'ALARM', NewStateReason: 'Disk above 85%', StateChangeTime: '2026-09-26T03:00:00Z' }
    const res = await deliver(signed({ Type: 'Notification', Subject: 'ALARM', Message: JSON.stringify(alarm) }))
    expect(res.status).toBe(200)
    expect(bodyOf(SLACK)?.text).toBe('ALARM: zhesen-disk\nReason: Disk above 85%\nAt: 2026-09-26T03:00:00Z')
  })

  it('refuses another topic, a bad signature and a body that is not SNS, and forwards none of them', async () => {
    const note = { Type: 'Notification' as const, Message: 'x' }
    expect((await deliver(signed({ ...note, TopicArn: `arn:aws:sns:ap-northeast-2:999999999999:zhesen-alerts` }))).status).toBe(403)
    expect((await deliver({ ...signed(note), Message: 'forged' })).status).toBe(403)
    expect((await snsPost(new Request('https://x/api/alerts/sns', { method: 'POST', body: 'not json' }))).status).toBe(400)
    expect(slackCalls()).toHaveLength(0)
  })

  it('does not fetch a SubscribeURL off the SNS host even when signed', async () => {
    const res = await deliver(signed({ Type: 'SubscriptionConfirmation', Message: 'c', SubscribeURL: 'https://evil.io/confirm', Token: 'abc' }))
    expect(res.status).toBe(400)
    expect(fetchMock.mock.calls.some(([u]) => String(u).startsWith('https://evil.io'))).toBe(false)
  })
})

describe('/api/admin/alerts', () => {
  const post = (body: unknown) => postAlerts(new Request('http://localhost/api/admin/alerts', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }))
  const puts = () => send.mock.calls.filter(([c]) => c instanceof PutParameterCommand)

  it('answers 404 to a non-admin', async () => {
    adminUser.mockResolvedValue(null)
    expect((await getAlerts()).status).toBe(404)
    expect((await post({ action: 'save', slack: null })).status).toBe(404)
    expect(send).not.toHaveBeenCalled()
  })

  it('returns the saved channels masked', async () => {
    const res = await getAlerts()
    const text = await res.text()
    expect(JSON.parse(text)).toEqual(maskChannels(CHANNELS))
    expect(text).not.toContain(TOKEN)
    expect(text).not.toContain(SLACK)
  })

  it('refuses a save without a sign-in in the last 10 minutes, recording and writing nothing', async () => {
    getClaims.mockResolvedValue({ data: { claims: { amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) - 601 }] } }, error: null })
    const res = await post({ action: 'save', slack: null })
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({ reauth: true })
    expect(rpc).not.toHaveBeenCalled()
    expect(puts()).toHaveLength(0)
  })

  it('writes the audit row before the parameter, without the secrets, then tells the old channels', async () => {
    stored = JSON.stringify({ slack: { webhookUrl: SLACK } })
    const order: string[] = []
    rpc.mockImplementation(async () => { order.push('audit'); return { data: null, error: null } })
    send.mockImplementation(async (cmd: unknown) => {
      if (cmd instanceof PutParameterCommand) { order.push('put'); stored = cmd.input.Value ?? null; return {} }
      return { Parameter: { Value: stored } }
    })
    const res = await post({ action: 'save', telegram: { botToken: TOKEN, chatId: '-1001234567890' } })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual(maskChannels(CHANNELS))
    expect(order).toEqual(['audit', 'put'])
    expect(rpc).toHaveBeenCalledWith('record', {
      p_action: 'infra.alert_channels', p_target: '/zhesen/prod/alert_channels', p_detail: { slack: 'kept', telegram: 'set' },
    })
    expect(JSON.parse(stored!)).toEqual(CHANNELS)
    expect((puts()[0][0] as PutParameterCommand).input).toMatchObject({ Type: 'SecureString', Overwrite: true })
    expect(bodyOf(SLACK)?.text).toContain('alert channels changed')
  })

  it('keeps a saved secret when only the other field is sent, and removes a channel on null', async () => {
    await post({ action: 'save', telegram: { chatId: '42' }, slack: null })
    expect(JSON.parse(stored!)).toEqual({ telegram: { botToken: TOKEN, chatId: '42' } })
  })

  it('writes nothing when the audit row fails or the value is invalid', async () => {
    expect((await post({ action: 'save', slack: { webhookUrl: 'https://example.com/hook' } })).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'admin only' } })
    expect((await post({ action: 'save', slack: null })).status).toBe(502)
    expect(puts()).toHaveLength(0)
  })

  it('sends a test to every saved channel and answers per channel', async () => {
    const res = await post({ action: 'test' })
    await expect(res.json()).resolves.toEqual({ results: [{ channel: 'slack', ok: true }, { channel: 'telegram', ok: true }] })
    expect(bodyOf(SLACK)?.text).toContain('test alert')
    stored = null
    expect((await post({ action: 'test' })).status).toBe(409)
  })
})
