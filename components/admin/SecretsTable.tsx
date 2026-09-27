'use client'
import { useCallback, useEffect, useState } from 'react'
import { z } from '@/lib/zod'
import { postAdmin } from '@/lib/admin/browser'
import { ago, Section, Status } from '@/components/admin/Page'
import { GuardDialog } from '@/components/admin/GuardDialog'

const PATH = '/api/admin/secrets'

/** `GET /api/admin/secrets` (lib/admin/secrets.ts buildInventory). */
const rowSchema = z.object({
  id: z.string(),
  group: z.enum(['App keys', 'Instance', 'Vercel', 'Config']),
  purpose: z.string(),
  where: z.string(),
  set: z.boolean(),
  changedAt: z.string().nullable(),
  version: z.number().nullable(),
  last4: z.string().nullable(),
  value: z.string().nullable(),
  revealable: z.boolean(),
  apply: z.enum(['app', 'ssm', 'instance', 'postgres', 'jwt', 'vercel']).nullable(),
  locked: z.string().nullable(),
  generate: z.boolean(),
  hint: z.string().nullable(),
  test: z.enum(['azure', 'ai']).nullable(),
  services: z.array(z.string()),
})
type Row = z.infer<typeof rowSchema>

const stateSchema = z.union([
  z.object({ enabled: z.literal(false) }),
  z.object({ rows: z.array(rowSchema), vercelToken: z.boolean() }),
])

const GROUPS = ['App keys', 'Instance', 'Vercel', 'Config'] as const

/** A revealed value goes back into hiding after this. */
const SHOW_MS = 30_000

const button = 'rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/[0.04] disabled:opacity-40'
const input = 'w-full rounded-lg border border-black/15 px-3 py-2 font-mono text-sm'

function consequence(r: Row): string {
  const services = r.services.length ? `recreates ${r.services.join(', ')}` : 'no service reads it, so nothing is recreated'
  switch (r.apply) {
    case 'app': return 'Saves the SSM parameter. This server uses it at once, every other within 60 seconds.'
    case 'ssm': return 'Saves the SSM parameter. It is read on its next use.'
    case 'instance': return `Saves the SSM parameter, renders .env on the instance, then ${services}.`
    case 'postgres': return `Changes the password of every database role, saves the SSM parameter, renders .env, then ${services}. Every service reconnects, so expect a few seconds of errors.`
    case 'jwt': return `Signs new anon and service_role keys with the new secret, saves all three, ${services}, writes the new anon key to Vercel and starts a production build. Every user is signed out, and the site is down until that build is live, a few minutes. This page stops working until then too.`
    case 'vercel': return 'Saves the Vercel env var and starts a production build. The change is live when the build is.'
    default: return ''
  }
}

/** Every secret with its home and state. Reveal and Edit go through the guard on the
 *  server; a revealed value stays on screen for 30 seconds. */
export function SecretsTable() {
  const [state, setState] = useState<{ rows: Row[]; vercelToken: boolean } | 'disabled' | 'error' | null>(null)
  const [shown, setShown] = useState<{ id: string; value: string } | null>(null)
  const [reauthFor, setReauthFor] = useState<string | null>(null)
  const [editing, setEditing] = useState<Row | null>(null)
  const [draft, setDraft] = useState('')
  const [generate, setGenerate] = useState(false)
  const [notes, setNotes] = useState<Record<string, { tone: 'ok' | 'bad'; text: string }>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch(PATH, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) return setState('error')
        const s = stateSchema.parse(await res.json())
        setState('enabled' in s ? 'disabled' : s)
      })
      .catch(() => setState('error'))
  }, [])

  useEffect(load, [load])

  useEffect(() => {
    if (!shown) return
    const t = setTimeout(() => setShown(null), SHOW_MS)
    return () => clearTimeout(t)
  }, [shown])

  if (state === 'disabled') return <p className="mt-6 text-sm text-black/60">AWS access is not configured for this deployment (AWS_ROLE_ARN).</p>
  if (state === 'error') return <p className="mt-6 text-sm text-rose-700">The secrets could not be read.</p>
  if (state === null) return <p className="mt-6 text-sm text-black/50">Reading…</p>

  const note = (id: string, tone: 'ok' | 'bad', text: string) => setNotes((n) => ({ ...n, [id]: { tone, text } }))

  const revealed = (id: string, data: unknown) => {
    const parsed = z.object({ value: z.string() }).safeParse(data)
    if (parsed.success) setShown({ id, value: parsed.data.value })
  }

  async function reveal(r: Row) {
    setBusy(r.id)
    const outcome = await postAdmin(PATH, { action: 'reveal', id: r.id })
    setBusy(null)
    if (outcome.ok) revealed(r.id, outcome.data)
    else if (outcome.reauth) setReauthFor(r.id)
    else note(r.id, 'bad', outcome.message)
  }

  async function test(r: Row) {
    setBusy(r.id)
    const outcome = await postAdmin(PATH, { action: 'test', id: r.id })
    setBusy(null)
    if (!outcome.ok) return note(r.id, 'bad', outcome.message)
    const parsed = z.object({ result: z.string() }).safeParse(outcome.data)
    note(r.id, 'ok', parsed.success ? parsed.data.result : 'The test ran.')
  }

  function edit(r: Row) {
    setDraft('')
    setGenerate(false)
    setEditing(r)
  }

  const vercelMissing = (r: Row) => (r.apply === 'jwt' || r.apply === 'vercel') && !state.vercelToken
    ? 'Needs vercel_token: this change writes a Vercel env var and redeploys. Set vercel_token first.'
    : null

  return (
    <div>
      {GROUPS.map((g) => {
        const rows = state.rows.filter((r) => r.group === g)
        if (rows.length === 0) return null
        return (
          <Section key={g} title={g}>
            <ul className="divide-y divide-black/5 rounded-lg border border-black/10">
              {rows.map((r) => {
                const blocked = r.locked ?? vercelMissing(r)
                const n = notes[r.id]
                return (
                  <li key={r.id} className="flex flex-col gap-2 px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1">
                      <div className="min-w-0 flex-1">
                        <code className="font-mono font-bold wrap-anywhere">{r.id}</code>
                        <p className="text-black/60">{r.purpose}</p>
                        <p className="text-xs text-black/50 wrap-anywhere">{r.where}</p>
                      </div>
                      <div className="text-right">
                        {r.group === 'Config' ? (
                          <code className="font-mono text-xs wrap-anywhere">{r.value ?? '–'}</code>
                        ) : (
                          <Status tone={r.set ? 'ok' : 'idle'}>{r.set ? (r.last4 ? `Set, ends …${r.last4}` : 'Set') : 'Not set'}</Status>
                        )}
                        {r.version !== null && r.changedAt && (
                          <div className="text-xs text-black/45">v{r.version} · changed {ago(r.changedAt)}</div>
                        )}
                      </div>
                    </div>

                    {shown?.id === r.id && (
                      <div className="flex flex-wrap items-center gap-2 rounded-md bg-black/[0.04] px-3 py-2">
                        <code className="min-w-0 flex-1 font-mono text-xs break-all">{shown.value}</code>
                        <button type="button" className={button} onClick={() => void navigator.clipboard.writeText(shown.value)}>Copy</button>
                        <button type="button" className={button} onClick={() => setShown(null)}>Hide</button>
                      </div>
                    )}
                    {n && <p role="status" className={`text-xs ${n.tone === 'ok' ? 'text-emerald-800' : 'text-rose-700'}`}>{n.text}</p>}
                    {blocked && r.group !== 'Config' && <p className="text-xs text-black/50">{blocked}</p>}

                    {(r.revealable || r.test || !blocked) && (
                      <div className="flex flex-wrap gap-2">
                        {r.revealable && (
                          <button type="button" className={button} disabled={busy === r.id} onClick={() => void reveal(r)}>Reveal</button>
                        )}
                        {!blocked && r.apply && <button type="button" className={button} onClick={() => edit(r)}>Edit</button>}
                        {r.test && (
                          <button type="button" className={button} disabled={busy === r.id} onClick={() => void test(r)}>
                            {busy === r.id ? 'Testing…' : 'Test'}
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </Section>
        )
      })}

      {reauthFor && (
        <GuardDialog
          open
          reauthFirst
          title={`Reveal ${reauthFor}`}
          target={null}
          actionLabel="Reveal"
          run={() => postAdmin(PATH, { action: 'reveal', id: reauthFor })}
          onClose={() => setReauthFor(null)}
          onDone={(data) => revealed(reauthFor, data)}
        >
          <p>The value shows for 30 seconds. An audit row and an alert record that it was shown.</p>
        </GuardDialog>
      )}

      {editing && (
        <GuardDialog
          open
          title={`Change ${editing.id}`}
          target={editing.id}
          actionLabel={editing.apply === 'jwt' ? 'Rotate' : 'Save'}
          run={(confirm) => postAdmin(PATH, { action: 'update', id: editing.id, value: generate ? undefined : draft, generate, confirm })}
          onClose={() => setEditing(null)}
          onDone={(data) => {
            const parsed = z.object({ summary: z.array(z.string()) }).safeParse(data)
            note(editing.id, 'ok', parsed.success ? parsed.data.summary.join(' ') : 'Saved.')
            setShown(null)
            load()
          }}
        >
          <div className="flex flex-col gap-3">
            <p>{consequence(editing)}</p>
            {editing.generate && (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={generate} onChange={(e) => setGenerate(e.target.checked)} />
                <span>Generate a random value</span>
              </label>
            )}
            {!generate && (
              <label className="flex flex-col gap-1">
                <span>New value</span>
                <input value={draft} onChange={(e) => setDraft(e.target.value)} autoComplete="off" spellCheck={false} className={input} />
                {editing.hint && <span className="text-xs text-black/50">{editing.hint}</span>}
              </label>
            )}
          </div>
        </GuardDialog>
      )}
    </div>
  )
}
