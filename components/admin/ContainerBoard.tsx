'use client'
import { useState, type ReactNode } from 'react'
import { z } from '@/lib/zod'
import { usePoll } from '@/lib/hooks/usePoll'
import { postAdmin } from '@/lib/admin/browser'
import {
  LOG_SERVICES, parseContainersResponse, type ContainerState, type ContainersResponse, type SeriesPoint,
} from '@/lib/admin/monitor'
import { formatBytes } from '@/lib/admin/metrics'
import { CARD, clock, Status, BUTTON } from '@/components/admin/Page'
import { GuardDialog } from '@/components/admin/GuardDialog'
import { Modal } from '@/components/ui/Modal'
import { containerTone, duration, Freshness, HEALTH, LogViewer, Trail } from '@/components/admin/MonitorLive'

const EVERY_MS = 5_000
/** One hour of 5-second sampler rows. */
const HOUR = 720
/** The hour gains one row per 5 s, so it is read once a minute: read every 5 s it was 590 kB
 *  each time. The 5 s poll leaves it out. */
const HOUR_MS = 60_000
const PATH = '/api/admin/monitor?part=containers'

type Service = (typeof LOG_SERVICES)[number]

const shellSchema = z.object({ exitCode: z.number(), stdout: z.string(), stderr: z.string() }).partial()

const pct = (n: number) => `${n.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`
const bytes = (n: number | null) => (n === null ? '–' : formatBytes(n))
const values = (points: SeriesPoint[], key: 'cpu' | 'mem') => points.flatMap((p) => {
  const v = p[key]
  return v === null ? [] : [v]
})

/** Containers named in docker-compose.yml, whose logs and restart the API allows. */
const serviceOf = (c: ContainerState) => LOG_SERVICES.find((s) => c.name === `supabase-${s}`)

/** The compose services in LOG_SERVICES order, then anything else by name. */
function byService(a: ContainerState, b: ContainerState): number {
  const rank = (c: ContainerState) => {
    const s = serviceOf(c)
    return s ? LOG_SERVICES.indexOf(s) : LOG_SERVICES.length
  }
  return rank(a) - rank(b) || a.name.localeCompare(b.name)
}

function Tile({ label, value, note, children }: { label: string; value: string; note?: string; children?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg bg-(--tint-2) px-3 py-2.5">
      <div className="text-xs text-(--zs-soft)">{label}</div>
      <div className="mt-0.5 truncate text-base font-medium tabular-nums">{value}</div>
      {note && <div className="mt-0.5 truncate text-xs text-(--zs-soft) tabular-nums">{note}</div>}
      {children}
    </div>
  )
}

function Card({ c, role, points, now, sampler, onLogs, onRestart }: {
  c: ContainerState
  role: string | undefined
  points: SeriesPoint[]
  now: number
  sampler: boolean
  onLogs: (s: Service) => void
  onRestart: (s: Service) => void
}) {
  const svc = serviceOf(c)
  const running = c.status === 'running'
  const share = c.memBytes !== null && c.memLimitBytes ? Math.min(1, c.memBytes / c.memLimitBytes) : null
  const hasDetails = c.ports.length > 0 || c.mounts.length > 0 || c.healthLog !== null
  return (
    <li className={`flex min-w-0 flex-col ${CARD}`}>
      <div className="px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="min-w-0 truncate font-mono text-sm font-medium">{c.name}</h2>
          <span className="shrink-0 text-xs">
            <Status tone={containerTone(c.status, c.health)}>
              {running ? (c.health ? HEALTH[c.health] ?? c.health : 'running') : c.status}
            </Status>
          </span>
        </div>
        {role && <p className="mt-1 text-sm text-(--zs-soft)">{role}</p>}
        <p className="mt-1 font-mono text-xs text-(--zs-soft) wrap-anywhere">{c.image}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-(--edge) px-4 py-3">
        <Tile label="CPU" value={c.cpuPercent === null ? '–' : pct(c.cpuPercent)}>
          {sampler && <div className="mt-1"><Trail values={values(points, 'cpu')} slots={HOUR} label={`${c.name} CPU, last hour`} /></div>}
        </Tile>
        <Tile label="Memory" value={bytes(c.memBytes)} note={c.memLimitBytes === null ? undefined : `of ${formatBytes(c.memLimitBytes)}`}>
          {share !== null && (
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-(--tint-3)" role="meter" aria-label={`${c.name} memory`}
              aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}>
              <div className={`h-full ${share >= 0.9 ? 'bg-rose-700' : share >= 0.8 ? 'bg-amber-700' : 'bg-(--zs-pen)'}`} style={{ width: `${share * 100}%` }} />
            </div>
          )}
        </Tile>
      </div>

      {hasDetails && (
        <details className="border-t border-(--edge) px-4 py-2 text-xs">
          <summary className="cursor-pointer text-sm text-(--zs-soft)">Details</summary>
          <div className="mt-2 space-y-3 pb-1">
            {c.ports.length > 0 && (
              <div>
                <div className="text-(--zs-soft)">Ports</div>
                <ul className="mt-0.5 font-mono">{c.ports.map((p) => <li key={p} className="break-all">{p}</li>)}</ul>
              </div>
            )}
            {c.mounts.length > 0 && (
              <div>
                <div className="text-(--zs-soft)">Mounts</div>
                <ul className="mt-0.5 space-y-0.5 font-mono">
                  {c.mounts.map((m) => (
                    <li key={m.destination} className="break-all">{`${m.type} ${m.source} → ${m.destination} ${m.rw ? 'rw' : 'ro'}`}</li>
                  ))}
                </ul>
              </div>
            )}
            {c.healthLog && (
              <div>
                <div className="text-(--zs-soft) tabular-nums">
                  Last healthcheck · <span className={c.healthLog.exitCode === 0 ? undefined : 'text-rose-700'}>exit {c.healthLog.exitCode}</span> · {clock(c.healthLog.at)}
                </div>
                <pre className="mt-0.5 max-h-40 overflow-auto rounded bg-(--tint-2) p-2 font-mono whitespace-pre-wrap break-all">
                  {c.healthLog.output.trim() || 'No output'}
                </pre>
              </div>
            )}
          </div>
        </details>
      )}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-(--edge) px-4 py-2.5">
        <div className="flex gap-x-3 text-xs tabular-nums">
          {running && c.startedAt && <span className="text-(--zs-soft)">up {duration(Math.max(0, (now - Date.parse(c.startedAt)) / 1000))}</span>}
          <span className={c.restarts > 0 ? 'text-amber-800' : 'text-(--zs-soft)'}>{c.restarts} restarts</span>
        </div>
        {svc && (
          <div className="flex gap-2">
            <button type="button" className={BUTTON} onClick={() => onLogs(svc)}>Logs</button>
            <button type="button" className={BUTTON} onClick={() => onRestart(svc)}>Restart</button>
          </div>
        )}
      </div>
    </li>
  )
}

/** Every container on the instance every 5 seconds, with the last hour from the sampler.
 *  `roles` maps a container name to what it does here. */
export function ContainerBoard({ roles }: { roles: Record<string, string> }) {
  const hourPoll = usePoll<ContainersResponse>(PATH, HOUR_MS, parseContainersResponse)
  const poll = usePoll<ContainersResponse>(`${PATH}&hour=0`, EVERY_MS, parseContainersResponse)
  const [restart, setRestart] = useState<Service | null>(null)
  const [logs, setLogs] = useState<Service | null>(null)
  const [result, setResult] = useState<{ title: string; at: Date; text: string } | null>(null)

  const data = poll.state === 'loading' ? undefined : poll.data
  if (data && 'enabled' in data) return <p className="text-sm text-(--zs-soft)">AWS read not configured (AWS_ROLE_ARN).</p>
  const sampler = data?.source === 'sampler'
  const hourData = hourPoll.state === 'loading' ? undefined : hourPoll.data
  const hour = hourData && !('enabled' in hourData) ? hourData : undefined
  const series = new Map<string, SeriesPoint[]>(hour?.series.map((s) => [s.name, s.points]))
  const containers = data ? [...data.containers].sort(byService) : []
  const host = hour?.host ?? []
  const last = data?.host.at(-1) ?? host.at(-1)
  const up = containers.filter((c) => c.status === 'running').length

  return (
    <div>
      <p className="mb-3 text-sm"><Freshness poll={poll} everyMs={EVERY_MS} /></p>
      {data && (
        <>
          {!sampler && <p className="mb-3 text-sm text-(--zs-soft)">Sampler offline; showing a slower SSM read without history.</p>}
          <div className="grid grid-cols-3 gap-3">
            <Tile label="Host CPU" value={last?.cpu == null ? '–' : pct(last.cpu)}>
              {sampler && <div className="mt-1"><Trail values={values(host, 'cpu')} slots={HOUR} label="Host CPU, last hour" /></div>}
            </Tile>
            <Tile label="Host memory" value={bytes(last?.mem ?? null)}>
              {sampler && <div className="mt-1"><Trail values={values(host, 'mem')} slots={HOUR} label="Host memory, last hour" /></div>}
            </Tile>
            <Tile label="Containers" value={`${up} / ${containers.length}`} note="running" />
          </div>

          {result && (
            <div role="status" className={`mt-4 ${CARD} px-4 py-3`}>
              <div className="text-sm font-medium">{result.title}, {clock(result.at)}</div>
              {result.text && <pre className="mt-1.5 overflow-x-auto font-mono text-xs whitespace-pre-wrap text-(--zs-soft)">{result.text}</pre>}
            </div>
          )}

          <ul className="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {containers.map((c) => (
              <Card key={c.name} c={c} role={roles[c.name]} points={series.get(c.name) ?? []} now={Date.parse(data.at)} sampler={sampler}
                onLogs={setLogs} onRestart={setRestart} />
            ))}
          </ul>
        </>
      )}

      {restart && (
        <GuardDialog
          open
          title={`Restart supabase-${restart}`}
          target={`supabase-${restart}`}
          actionLabel="Restart"
          run={(confirm) => postAdmin('/api/admin/control', { action: 'restart', service: restart, confirm })}
          onClose={() => setRestart(null)}
          onDone={(done) => {
            const r = shellSchema.safeParse(done)
            const text = r.success ? [r.data.stdout, r.data.stderr].filter(Boolean).join('\n').trim() : ''
            const failed = r.success && r.data.exitCode !== undefined && r.data.exitCode !== 0
            setResult({ title: `Restart supabase-${restart}: ${failed ? `failed, exit ${r.data.exitCode}` : 'done'}`, at: new Date(), text })
          }}
        >
          <p>
            {restart === 'db'
              ? 'Postgres stops for a few seconds; running queries are cancelled.'
              : 'The container stops for a few seconds; requests to it fail meanwhile.'}
          </p>
        </GuardDialog>
      )}

      {logs && (
        <Modal open title={`supabase-${logs} logs`} titleId="logs-title" widthClass="max-w-4xl" onClose={() => setLogs(null)}>
          <div className="p-5"><LogViewer fixed={logs} /></div>
        </Modal>
      )}
    </div>
  )
}
