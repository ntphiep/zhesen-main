'use client'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { usePoll, type Poll } from '@/lib/hooks/usePoll'
import {
  LOG_SERVICES, parseHostResponse, parseLive, parseLogsResponse, rates,
  type HostResponse, type LiveSample, type LogsResponse, type Rates,
} from '@/lib/admin/monitor'
import { formatBytes } from '@/lib/admin/metrics'
import { clock, num, Status, type Tone } from '@/components/admin/Page'

const LIVE_MS = 10_000
const HOST_MS = 5_000
/** Ten minutes of 10-second samples. */
const KEEP = 60

const rate = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: n < 10 ? 1 : 0 })
const pct = (n: number) => `${n.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`

/** When the last poll landed, or why it did not. */
export function Freshness({ poll, everyMs }: { poll: Poll<unknown>; everyMs: number }) {
  const every = `every ${everyMs / 1000} s`
  if (poll.state === 'loading') return <Status tone="idle">Loading</Status>
  if (poll.state === 'error') {
    return <Status tone="bad">{poll.message}{poll.at ? ` Showing data from ${clock(new Date(poll.at))}.` : ''}</Status>
  }
  return <Status tone="ok">Updated {clock(new Date(poll.at))} · {every}</Status>
}

/** The last `slots` values of one number, newest at the right edge, drawn without axes:
 *  its shape is the point. */
export function Trail({ values, label, slots = KEEP }: { values: number[]; label: string; slots?: number }) {
  if (values.length < 2) return <div className="h-8" />
  const max = Math.max(...values, 1e-9)
  const step = 100 / (slots - 1)
  const offset = (slots - values.length) * step
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${(offset + i * step).toFixed(2)},${(30 - (v / max) * 28).toFixed(2)}`).join(' ')
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-8 w-full" role="img" aria-label={label}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" className="text-black/60" />
    </svg>
  )
}

function Reading({ label, value, note, trail }: { label: string; value: string; note?: string; trail?: number[] }) {
  return (
    <div className="min-w-0 rounded-lg border border-black/10 px-4 pt-3 pb-2">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-sm text-black/60">{label}</div>
      {note && <div className="text-xs text-black/45">{note}</div>}
      {trail && <div className="mt-1"><Trail values={trail} label={`${label}, last 10 minutes`} /></div>}
    </div>
  )
}

const CONNECTION_STATE: Record<string, string> = {
  active: 'active',
  idle: 'idle',
  'idle in transaction': 'idle in tx',
  'idle in transaction (aborted)': 'aborted tx',
}

/** Postgres every 10 seconds: connections, throughput and what is running right now. */
export function LivePanel() {
  const prev = useRef<LiveSample | null>(null)
  const [trail, setTrail] = useState<{ r: Rates; connections: number }[]>([])
  const poll = usePoll('/api/admin/monitor?part=live', LIVE_MS, parseLive, (cur) => {
    const r = prev.current ? rates(prev.current, cur) : null
    prev.current = cur
    const connections = Object.values(cur.connections).reduce((a, b) => a + b, 0)
    if (r) setTrail((t) => [...t, { r, connections }].slice(-KEEP))
  })
  const live = poll.state === 'loading' ? undefined : poll.data
  const last = trail.at(-1)?.r
  const total = live ? Object.values(live.connections).reduce((a, b) => a + b, 0) : 0

  return (
    <div>
      <p className="mb-3 text-sm"><Freshness poll={poll} everyMs={LIVE_MS} /></p>
      {live && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Reading
              label="Connections"
              value={`${total} / ${live.maxConnections}`}
              note={Object.entries(live.connections).map(([s, n]) => `${n} ${CONNECTION_STATE[s] ?? s}`).join(', ')}
              trail={trail.map((t) => t.connections)}
            />
            <Reading
              label="Commits / s"
              value={last ? rate(last.commitsPerSec) : '…'}
              note={last && last.rollbacksPerSec > 0 ? `${rate(last.rollbacksPerSec)} rollbacks / s` : 'No rollbacks'}
              trail={trail.map((t) => t.r.commitsPerSec)}
            />
            <Reading
              label="Rows read / s"
              value={last ? rate(last.rowsReadPerSec) : '…'}
              note={last?.hitRatio == null ? undefined
                : last.hitRatio >= 0.9995 ? 'Cache hit 100%'
                  : `Cache hit ${pct(last.hitRatio * 100)}`}
              trail={trail.map((t) => t.r.rowsReadPerSec)}
            />
            <Reading
              label="Rows written / s"
              value={last ? rate(last.rowsWrittenPerSec) : '…'}
              note={live.lockWaits > 0 ? `${live.lockWaits} waiting on locks` : 'No lock waits'}
              trail={trail.map((t) => t.r.rowsWrittenPerSec)}
            />
          </div>
          {!last && <p className="mt-2 text-xs text-black/45">Rates appear after the second sample, in 10 s.</p>}

          <h3 className="mt-5 mb-2 text-sm font-medium">Running queries ({live.running.length})</h3>
          {live.running.length === 0 ? (
            <p className="text-sm text-black/55">None besides this read.</p>
          ) : (
            <ul className="divide-y divide-black/5 rounded-lg border border-black/10">
              {live.running.map((q) => (
                <li key={q.pid} className="px-4 py-2.5">
                  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-xs text-black/55 tabular-nums">
                    <span className="font-medium text-black/80">{q.seconds !== null ? `${rate(q.seconds)} s` : '–'}</span>
                    <span>{q.user ?? 'unknown'}{q.application ? ` via ${q.application}` : ''}</span>
                    <span>{CONNECTION_STATE[q.state ?? ''] ?? q.state}</span>
                    {q.wait && <span className="text-amber-800">waiting {q.wait}</span>}
                    <span>pid {q.pid}</span>
                  </div>
                  <code className="mt-1 block font-mono text-xs break-all text-black/70">{q.query}</code>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

function Meter({ label, used, total, format }: { label: string; used: number; total: number; format: (n: number) => string }) {
  const share = total > 0 ? used / total : 0
  const tone = share >= 0.9 ? 'bg-rose-700' : share >= 0.8 ? 'bg-amber-700' : 'bg-black/60'
  return (
    <div className="min-w-0 rounded-lg border border-black/10 px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-black/60">{label}</span>
        <span className="text-sm tabular-nums">{pct(share * 100)}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/[0.06]" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}>
        <div className={`h-full ${tone}`} style={{ width: `${Math.min(100, share * 100)}%` }} />
      </div>
      <div className="mt-1.5 text-xs text-black/50 tabular-nums">{format(used)} of {format(total)}</div>
    </div>
  )
}

export function duration(seconds: number): string {
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3600)
  return days > 0 ? `${days} d ${hours} h` : `${hours} h ${Math.floor((seconds % 3600) / 60)} min`
}

export function containerTone(status: string, health: string | null): Tone {
  if (status !== 'running') return 'bad'
  if (health === 'unhealthy') return 'bad'
  if (health === 'starting') return 'warn'
  return 'ok'
}

export const HEALTH: Record<string, string> = { healthy: 'healthy', unhealthy: 'unhealthy', starting: 'starting' }

/** The instance and each container every 5 seconds. */
export function HostPanel() {
  const poll = usePoll<HostResponse>('/api/admin/monitor?part=host', HOST_MS, parseHostResponse)
  const host = poll.state === 'loading' ? undefined : poll.data
  if (host && 'enabled' in host) {
    return <p className="text-sm text-black/60">AWS read not configured (AWS_ROLE_ARN).</p>
  }
  const now = host ? Date.parse(host.at) : 0

  return (
    <div>
      <p className="mb-3 text-sm"><Freshness poll={poll} everyMs={HOST_MS} /></p>
      {host && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {host.memory && <Meter label="Memory" used={host.memory.total - host.memory.available} total={host.memory.total} format={formatBytes} />}
            {host.disk && <Meter label="Disk" used={host.disk.used} total={host.disk.size} format={formatBytes} />}
            {host.load && (
              <div className="min-w-0 rounded-lg border border-black/10 px-4 py-3">
                <div className="text-2xl font-semibold tabular-nums">{host.load[0].toLocaleString('en-US')}</div>
                <div className="text-sm text-black/60">Load average, 1 min</div>
                <div className="text-xs text-black/45 tabular-nums">
                  5 min {host.load[1].toLocaleString('en-US')} · 15 min {host.load[2].toLocaleString('en-US')}
                  {host.cpus ? ` · ${host.cpus} vCPU` : ''}
                </div>
              </div>
            )}
            {host.uptimeSeconds !== null && (
              <div className="min-w-0 rounded-lg border border-black/10 px-4 py-3">
                <div className="text-2xl font-semibold tabular-nums">{duration(host.uptimeSeconds)}</div>
                <div className="text-sm text-black/60">Uptime</div>
              </div>
            )}
          </div>

          <div className="mt-4 overflow-x-auto rounded-lg border border-black/10">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b border-black/10 text-left text-xs text-black/50">
                  <th className="px-4 py-2 font-medium">Container</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 text-right font-medium">CPU</th>
                  <th className="px-4 py-2 text-right font-medium">Memory</th>
                  <th className="px-4 py-2 font-medium">Up for</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {host.containers.map((c) => (
                  <tr key={c.name}>
                    <td className="px-4 py-2">
                      <div className="font-mono">{c.name}</div>
                      <div className="font-mono text-xs text-black/45">{c.image}</div>
                    </td>
                    <td className="px-4 py-2">
                      <Status tone={containerTone(c.status, c.health)}>
                        {c.status === 'running' ? (c.health ? HEALTH[c.health] ?? c.health : 'running') : c.status}
                      </Status>
                      {c.restarts > 0 && <div className="text-xs text-amber-800">{c.restarts} restarts</div>}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{c.cpuPercent !== null ? pct(c.cpuPercent) : '–'}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {c.memBytes !== null ? formatBytes(c.memBytes) : '–'}
                      {c.memLimitBytes !== null && <div className="text-xs text-black/45">limit {formatBytes(c.memLimitBytes)}</div>}
                    </td>
                    <td className="px-4 py-2 text-black/70 tabular-nums">{c.startedAt ? duration(Math.max(0, (now - Date.parse(c.startedAt)) / 1000)) : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-sm">
            <Link href="/admin/containers" prefetch={false} className="underline underline-offset-2 hover:text-black/70">All containers</Link>
          </p>
        </>
      )}
    </div>
  )
}

type LogState = { state: 'idle' } | { state: 'busy' } | { state: 'error'; message: string } | { state: 'ok'; data: LogsResponse }

type Service = (typeof LOG_SERVICES)[number]

async function readLogs(service: Service): Promise<LogState> {
  try {
    const res = await fetch(`/api/admin/monitor?part=logs&service=${service}`, { cache: 'no-store' })
    const body: unknown = await res.json()
    if (!res.ok) {
      const message = typeof body === 'object' && body && 'error' in body && typeof body.error === 'string' ? body.error : `HTTP ${res.status}`
      return { state: 'error', message }
    }
    return { state: 'ok', data: parseLogsResponse(body) }
  } catch {
    return { state: 'error', message: 'Lost connection to the server.' }
  }
}

/** One container's last 15 minutes, read on request rather than polled. Given `fixed`, it
 *  reads that container at once and offers no picker. */
export function LogViewer({ fixed }: { fixed?: Service } = {}) {
  const [picked, setService] = useState<Service>('db')
  const service = fixed ?? picked
  const [logs, setLogs] = useState<LogState>(fixed ? { state: 'busy' } : { state: 'idle' })
  const box = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (logs.state === 'ok' && box.current) box.current.scrollTop = box.current.scrollHeight
  }, [logs])

  useEffect(() => {
    if (!fixed) return
    let alive = true
    void readLogs(fixed).then((l) => { if (alive) setLogs(l) })
    return () => { alive = false }
  }, [fixed])

  async function load() {
    setLogs({ state: 'busy' })
    setLogs(await readLogs(service))
  }

  const data = logs.state === 'ok' ? logs.data : undefined
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {!fixed && <div role="radiogroup" aria-label="Container" className="flex flex-wrap gap-1 rounded-lg border border-black/10 p-1">
          {LOG_SERVICES.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={service === s}
              onClick={() => setService(s)}
              className={`rounded-md px-3 py-1 font-mono text-sm ${service === s ? 'bg-black text-white' : 'text-black/65 hover:bg-black/[0.05]'}`}
            >
              {s}
            </button>
          ))}
        </div>}
        <button
          type="button"
          onClick={() => void load()}
          disabled={logs.state === 'busy'}
          className="rounded-lg border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/[0.04] disabled:opacity-40"
        >
          {logs.state === 'busy' ? 'Reading' : 'Read last 15 min'}
        </button>
      </div>

      {logs.state === 'error' && <p role="status" className="mt-3 text-sm text-rose-700">{logs.message}</p>}
      {data && 'enabled' in data && <p className="mt-3 text-sm text-black/60">AWS read not configured (AWS_ROLE_ARN).</p>}
      {data && !('enabled' in data) && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs text-black/50">
            supabase-{data.service} · {num(data.lines.length)} lines · read {clock(data.at)} · newest last
            {data.truncated && ' · oldest lines cut at the SSM limit'}
          </p>
          {data.lines.length === 0 ? (
            <p className="text-sm text-black/55">No log lines in the last 15 minutes.</p>
          ) : (
            <pre ref={box} className="max-h-[28rem] overflow-auto rounded-lg border border-black/10 bg-black/[0.03] p-3 font-mono text-xs leading-relaxed">
              {data.lines.map((l, i) => (
                <div key={i} className="whitespace-pre-wrap break-all">
                  {l.at && <span className="text-black/40 select-none">{clock(l.at)} </span>}
                  {l.text}
                </div>
              ))}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
