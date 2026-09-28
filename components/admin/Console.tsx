'use client'
import { useEffect, useState } from 'react'
import { z } from '@/lib/zod'
import { postAdmin } from '@/lib/admin/browser'
import { formatBytes } from '@/lib/admin/metrics'
import { clock, num, when } from '@/components/admin/Page'
import { GuardDialog } from '@/components/admin/GuardDialog'

const INSTANCE_NAME = 'zhesen-supabase'
/** SSM keeps only the first 24,000 characters of each stream. */
const LIMIT_NOTE = 'Output cut at 24,000 characters, the SSM limit.'

const runSchema = z.object({
  status: z.string(), exitCode: z.number(), stdout: z.string(), stderr: z.string(), truncated: z.boolean(), ms: z.number(),
  table: z.array(z.array(z.string())).nullable().optional(),
  db: z.string().optional(),
})
type Run = z.infer<typeof runSchema>

const tab = (on: boolean) => `rounded-md px-3 py-1 text-sm ${on ? 'bg-black text-white' : 'text-black/65 hover:bg-black/[0.05]'}`
const button = 'rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-40'

function Output({ run, at }: { run: Run; at: Date }) {
  const ok = run.exitCode === 0
  const rows = run.table && run.table.length > 0 ? run.table : null
  return (
    <div className="mt-3">
      <p className={`text-xs tabular-nums ${ok ? 'text-black/55' : 'text-rose-700'}`}>
        {ok ? `Done in ${num(Math.round(run.ms / 100) / 10)} s` : `Failed · exit ${run.exitCode}`}
        {rows ? ` · ${num(rows.length - 1)} rows` : ''} · {clock(at)}{run.truncated ? ` · ${LIMIT_NOTE}` : ''}
      </p>
      {rows ? (
        <div className="mt-1.5 max-h-[28rem] overflow-auto rounded-lg border border-black/10">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-black/10 text-left">
                {rows[0].map((h, i) => <th key={i} className="px-3 py-1.5 font-mono text-xs font-medium text-black/60">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {rows.slice(1).map((r, i) => (
                <tr key={i}>{r.map((c, j) => <td key={j} className="px-3 py-1 align-top font-mono text-xs whitespace-pre-wrap break-all">{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : run.stdout && (
        <pre className="mt-1.5 max-h-[28rem] overflow-auto rounded-lg border border-black/10 bg-black/[0.03] p-3 font-mono text-xs whitespace-pre-wrap">{run.stdout}</pre>
      )}
      {run.stderr && (
        <pre className="mt-1.5 max-h-60 overflow-auto rounded-lg border border-rose-200 bg-rose-50 p-3 font-mono text-xs whitespace-pre-wrap text-rose-800">{run.stderr}</pre>
      )}
    </div>
  )
}

function useRun() {
  const [run, setRun] = useState<{ run: Run; at: Date } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const take = (data: unknown) => {
    const r = runSchema.safeParse(data)
    if (r.success) { setRun({ run: r.data, at: new Date() }); setError(null) } else setError('Server returned data in the wrong shape.')
  }
  return { run, error, setError, take }
}

/** SQL as supabase_admin. Read mode needs no guard because Postgres refuses the writes. */
export function SqlConsole() {
  const [mode, setMode] = useState<'read' | 'write'>('read')
  const [sql, setSql] = useState('select count(*) from lex.entries;')
  const [busy, setBusy] = useState(false)
  const [guard, setGuard] = useState<null | { reauthFirst: boolean }>(null)
  const { run, error, setError, take } = useRun()

  async function runRead() {
    setBusy(true)
    const out = await postAdmin('/api/admin/control', { action: 'sql', mode: 'read', sql })
    setBusy(false)
    if (out.ok) take(out.data)
    else if (out.reauth) setGuard({ reauthFirst: true })
    else setError(out.message)
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="Mode" className="inline-flex gap-1 rounded-lg border border-black/10 p-1">
          <button type="button" role="radio" aria-checked={mode === 'read'} className={tab(mode === 'read')} onClick={() => setMode('read')}>Read only</button>
          <button type="button" role="radio" aria-checked={mode === 'write'} className={tab(mode === 'write')} onClick={() => setMode('write')}>Write</button>
        </div>
        <p className={`text-sm ${mode === 'read' ? 'text-black/55' : 'text-amber-800'}`}>
          {mode === 'read'
            ? 'Read-only transaction, 30 s timeout. psql \\ commands do not run.'
            : 'Runs exactly as typed on production and cannot be undone; stops after 2 minutes.'}
        </p>
      </div>
      <textarea
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        rows={6}
        spellCheck={false}
        aria-label="SQL"
        className="mt-3 w-full rounded-lg border border-black/15 px-3 py-2 font-mono text-sm"
      />
      <div className="mt-2 flex items-center gap-3">
        <button type="button" className={button} disabled={busy || !sql.trim()} onClick={() => (mode === 'read' ? void runRead() : setGuard({ reauthFirst: false }))}>
          {busy ? 'Running' : mode === 'read' ? 'Run' : 'Run write'}
        </button>
        <span className="font-mono text-xs text-black/55">supabase_admin · postgres</span>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
      {run && <Output run={run.run} at={run.at} />}
      {guard && (
        <GuardDialog
          open
          reauthFirst={guard.reauthFirst}
          title={mode === 'write' ? 'Run SQL · Write' : 'Run SQL · Read only'}
          target={mode === 'write' ? 'postgres' : null}
          actionLabel="Run"
          run={(confirm) => postAdmin('/api/admin/control', { action: 'sql', mode, sql, confirm })}
          onClose={() => setGuard(null)}
          onDone={take}
        >
          <p>
            {mode === 'write'
              ? 'Runs as supabase_admin on production and cannot be undone; Backup now on Infrastructure first is recommended.'
              : 'SQL can read every table, including accounts, so it needs a sign-in within the last 10 minutes.'}
          </p>
          <pre className="mt-2 max-h-40 overflow-auto rounded bg-black/[0.04] p-2 font-mono text-xs whitespace-pre-wrap">{sql}</pre>
        </GuardDialog>
      )}
    </div>
  )
}

/** One shell command as root, with its output; not an interactive terminal. */
export function ShellConsole() {
  const [command, setCommand] = useState('docker ps --format "table {{.Names}}\\t{{.Status}}"')
  const [timeout, setTimeoutSeconds] = useState(60)
  const [guard, setGuard] = useState(false)
  const { run, error, take } = useRun()
  return (
    <div>
      <textarea
        value={command}
        onChange={(e) => setCommand(e.target.value)}
        rows={3}
        spellCheck={false}
        aria-label="Shell command"
        className="w-full rounded-lg border border-black/15 px-3 py-2 font-mono text-sm"
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button type="button" className={button} disabled={!command.trim()} onClick={() => setGuard(true)}>Run</button>
        <label className="flex items-center gap-2 text-sm text-black/60">
          Timeout
          <input type="number" min={5} max={240} value={timeout} onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
            className="w-20 rounded-lg border border-black/15 px-2 py-1 tabular-nums" />
          s
        </label>
        <span className="text-xs text-black/55">root via SSM</span>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
      {run && <Output run={run.run} at={run.at} />}
      <GuardDialog
        open={guard}
        title="Run on the instance"
        target={INSTANCE_NAME}
        actionLabel="Run"
        run={(confirm) => postAdmin('/api/admin/control', { action: 'shell', command, confirm, timeout: Math.min(240, Math.max(5, timeout || 60)) })}
        onClose={() => setGuard(false)}
        onDone={take}
      >
        <p>Runs as root on the production server, writes an audit log and sends an email.</p>
        <pre className="mt-2 max-h-40 overflow-auto rounded bg-black/[0.04] p-2 font-mono text-xs whitespace-pre-wrap">{command}</pre>
      </GuardDialog>
    </div>
  )
}

const statusSchema = z.object({ db: z.string(), state: z.enum(['running', 'done', 'failed', 'missing']), entries: z.number().nullable(), warnings: z.number(), tail: z.string() })
type RestoreStatus = z.infer<typeof statusSchema>

/** A dump restored into its own database, for reading. Production is never touched. */
export function RestorePanel({ dumps }: { dumps: { key: string; at: string; bytes: number }[] }) {
  const [key, setKey] = useState(dumps[0]?.key ?? '')
  const [guard, setGuard] = useState(false)
  const [db, setDb] = useState<string | null>(null)
  const [status, setStatus] = useState<RestoreStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!db || status?.state === 'done' || status?.state === 'failed') return
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/control?restore=${db}`, { cache: 'no-store' })
        const s = statusSchema.safeParse(await res.json())
        if (s.success) setStatus(s.data)
      } catch {
        setError('Lost connection while reading progress.')
      }
    }, 10_000)
    return () => clearInterval(t)
  }, [db, status?.state])

  if (dumps.length === 0) return <p className="text-sm text-black/60">No dumps in the backup bucket.</p>
  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span>Dump</span>
          <select value={key} onChange={(e) => setKey(e.target.value)} className="rounded-lg border border-black/15 px-3 py-2 font-mono text-sm">
            {dumps.map((d) => <option key={d.key} value={d.key}>{when(d.at)}, {formatBytes(d.bytes)}</option>)}
          </select>
        </label>
        <button type="button" className={button} disabled={!key || (status?.state === 'running')} onClick={() => setGuard(true)}>Restore</button>
      </div>
      <p className="mt-2 text-sm text-black/55">Restores into a new database; the production database is not touched.</p>
      {error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
      {db && (
        <div role="status" className="mt-3 rounded-lg border border-black/10 px-4 py-3 text-sm">
          <div>
            Database <code className="font-mono">{db}</code>:{' '}
            {!status || status.state === 'running' ? 'Restoring · checked every 10 s'
              : status.state === 'done' ? `Done · lex.entries ${num(status.entries ?? 0)} rows${status.warnings ? ` · pg_restore exit ${status.warnings}, see log` : ''}`
                : status.state === 'failed' ? 'Failed' : 'No log yet'}
          </div>
          {status?.tail && <pre className="mt-1.5 max-h-48 overflow-auto font-mono text-xs whitespace-pre-wrap text-black/60">{status.tail}</pre>}
          {status?.state === 'done' && (
            <p className="mt-1.5 text-xs text-black/55">
              Read: <code className="font-mono">docker exec supabase-db psql -U supabase_admin -d {db} -c &quot;...&quot;</code>
              <br />
              Drop when done (Write): <code className="font-mono">drop database {db};</code>
            </p>
          )}
        </div>
      )}
      <GuardDialog
        open={guard}
        title="Restore dump"
        target={null}
        actionLabel="Restore"
        run={() => postAdmin('/api/admin/control', { action: 'restore', key })}
        onClose={() => setGuard(false)}
        onDone={(data) => {
          const r = runSchema.safeParse(data)
          if (r.success && r.data.db) { setDb(r.data.db); setStatus(null) } else setError('Could not start the restore.')
        }}
      >
        <p>
          Restores into a new database <code className="font-mono">restore_…</code>, without touching production; uses as much disk as the current database, up to 2 copies.
        </p>
      </GuardDialog>
    </div>
  )
}
