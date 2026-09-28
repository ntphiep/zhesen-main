'use client'
import { useEffect, useState, type FormEvent } from 'react'
import { z } from '@/lib/zod'
import { postAdmin } from '@/lib/admin/browser'
import { Status } from '@/components/admin/Page'
import { GuardDialog } from '@/components/admin/GuardDialog'

/** `GET /api/admin/alerts` (lib/admin/alerts.ts maskChannels). */
const maskedSchema = z.object({
  slack: z.object({ webhookUrl: z.string() }).nullable(),
  telegram: z.object({ botToken: z.string(), chatId: z.string() }).nullable(),
})
type Masked = z.infer<typeof maskedSchema>

const stateSchema = z.union([z.object({ enabled: z.literal(false) }), maskedSchema])

const testSchema = z.object({
  results: z.array(z.object({ channel: z.string(), ok: z.boolean(), error: z.string().optional() })),
})
type TestResult = z.infer<typeof testSchema>['results'][number]

type Pending = { title: string; label: string; text: string; body: Record<string, unknown> }

const button = 'rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/[0.04] disabled:opacity-40'
const input = 'rounded-lg border border-black/15 px-3 py-2 font-mono text-sm'

/** Where the owner's alerts go. Saving goes through GuardDialog; the secrets never come
 *  back from the server, so a field left empty keeps what is saved. */
export function AlertSettings() {
  const [state, setState] = useState<Masked | 'disabled' | 'error' | null>(null)
  const [slackUrl, setSlackUrl] = useState('')
  const [botToken, setBotToken] = useState('')
  const [chatId, setChatId] = useState('')
  const [pending, setPending] = useState<Pending | null>(null)
  const [tested, setTested] = useState<TestResult[] | null>(null)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/alerts', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) return setState('error')
        const s = stateSchema.parse(await res.json())
        setState('enabled' in s ? 'disabled' : s)
      })
      .catch(() => setState('error'))
  }, [])

  if (state === 'disabled') return <p className="text-sm text-black/60">AWS access is not configured for this deployment (AWS_ROLE_ARN).</p>
  const saved = state !== null && state !== 'error' ? state : null

  function save(e: FormEvent) {
    e.preventDefault()
    const telegram = { ...(botToken.trim() && { botToken: botToken.trim() }), ...(chatId.trim() && { chatId: chatId.trim() }) }
    const body = {
      action: 'save',
      ...(slackUrl.trim() && { slack: { webhookUrl: slackUrl.trim() } }),
      ...(Object.keys(telegram).length > 0 && { telegram }),
    }
    setPending({ title: 'Save alert channels', label: 'Save', text: 'Admin actions, alarms and the budget will be sent to these channels.', body })
  }

  async function test() {
    setTesting(true)
    setMessage(null)
    const outcome = await postAdmin('/api/admin/alerts', { action: 'test' })
    setTesting(false)
    if (!outcome.ok) return setMessage(outcome.message)
    setTested(testSchema.parse(outcome.data).results)
  }

  const result = (channel: string) => tested?.find((r) => r.channel === channel)

  function line(channel: 'slack' | 'telegram', label: string, detail: string | null) {
    const r = result(channel)
    return (
      <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
        <span className="flex flex-wrap items-baseline gap-x-3">
          <span className="font-medium">{label}</span>
          {r ? (
            <Status tone={r.ok ? 'ok' : 'bad'}>{r.ok ? 'Test sent' : `Test failed, ${r.error ?? 'unknown error'}`}</Status>
          ) : detail ? (
            <Status tone="ok">Set, {detail}</Status>
          ) : (
            <Status tone="idle">{state === null ? 'reading' : state === 'error' ? 'could not read' : 'Not set'}</Status>
          )}
        </span>
        {detail && (
          <button type="button" className={`${button} text-rose-700`}
            onClick={() => setPending({ title: `Remove ${label}`, label: 'Remove', text: `Alerts stop going to ${label}.`, body: { action: 'save', [channel]: null } })}>
            Remove
          </button>
        )}
      </li>
    )
  }

  const dirty = Boolean(slackUrl.trim() || botToken.trim() || chatId.trim())
  return (
    <div className="rounded-lg border border-black/10">
      <ul className="divide-y divide-black/5 border-b border-black/10">
        {line('slack', 'Slack', saved?.slack ? `webhook ${saved.slack.webhookUrl}` : null)}
        {line('telegram', 'Telegram', saved?.telegram ? `token ${saved.telegram.botToken}, chat ${saved.telegram.chatId}` : null)}
      </ul>
      <form onSubmit={save} className="flex flex-col gap-3 px-4 py-4">
        <label className="flex flex-col gap-1 text-sm">
          <span>Slack webhook URL</span>
          <input value={slackUrl} onChange={(e) => setSlackUrl(e.target.value)} autoComplete="off" spellCheck={false}
            placeholder={saved?.slack ? `Saved ${saved.slack.webhookUrl}` : 'https://hooks.slack.com/services/…'} className={input} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span>Telegram bot token</span>
            <input value={botToken} onChange={(e) => setBotToken(e.target.value)} autoComplete="off" spellCheck={false}
              placeholder={saved?.telegram ? `Saved ${saved.telegram.botToken}` : '123456789:AA…'} className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>Telegram chat id</span>
            <input value={chatId} onChange={(e) => setChatId(e.target.value)} autoComplete="off" spellCheck={false}
              placeholder={saved?.telegram?.chatId ?? '-1001234567890'} className={input} />
          </label>
        </div>
        <p className="text-xs text-black/55">An empty field keeps what is saved.</p>
        {message && <p role="alert" className="text-sm text-rose-700">{message}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={button} disabled={testing || !(saved?.slack || saved?.telegram)} onClick={() => void test()}>
            {testing ? 'Sending…' : 'Send test'}
          </button>
          <button type="submit" className={button} disabled={!dirty || saved === null}>Save</button>
        </div>
      </form>

      {pending && (
        <GuardDialog
          open
          title={pending.title}
          target={null}
          actionLabel={pending.label}
          run={() => postAdmin('/api/admin/alerts', pending.body)}
          onClose={() => setPending(null)}
          onDone={(data) => {
            setState(maskedSchema.parse(data))
            setSlackUrl(''); setBotToken(''); setChatId('')
            setTested(null)
            setMessage(null)
          }}
        >
          <p>{pending.text}</p>
        </GuardDialog>
      )}
    </div>
  )
}
