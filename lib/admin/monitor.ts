import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from '@/lib/zod'

/* ---------- Postgres, from admin.live() and admin.slow_queries() (migration 0062) ---------- */

const liveRow = z.object({
  at: z.string(),
  max_connections: z.number(),
  connections: z.record(z.string(), z.number()),
  running: z.array(z.object({
    pid: z.number(),
    user: z.string().nullable(),
    application: z.string().nullable(),
    state: z.string().nullable(),
    wait: z.string().nullable(),
    seconds: z.number().nullable(),
    query: z.string().nullable(),
  })),
  lock_waits: z.number(),
  database: z.object({
    bytes: z.number(),
    commits: z.number(),
    rollbacks: z.number(),
    blocks_hit: z.number(),
    blocks_read: z.number(),
    rows_returned: z.number(),
    rows_written: z.number(),
    deadlocks: z.number(),
    stats_reset: z.string().nullable(),
  }),
})

export interface LiveSample {
  at: string
  maxConnections: number
  connections: Record<string, number>
  running: { pid: number; user: string | null; application: string | null; state: string | null; wait: string | null; seconds: number | null; query: string | null }[]
  lockWaits: number
  bytes: number
  counters: { commits: number; rollbacks: number; blocksHit: number; blocksRead: number; rowsReturned: number; rowsWritten: number; deadlocks: number }
}

export function parseLive(raw: unknown): LiveSample {
  const x = liveRow.parse(raw)
  const d = x.database
  return {
    at: x.at,
    maxConnections: x.max_connections,
    connections: x.connections,
    running: x.running,
    lockWaits: x.lock_waits,
    bytes: d.bytes,
    counters: {
      commits: d.commits,
      rollbacks: d.rollbacks,
      blocksHit: d.blocks_hit,
      blocksRead: d.blocks_read,
      rowsReturned: d.rows_returned,
      rowsWritten: d.rows_written,
      deadlocks: d.deadlocks,
    },
  }
}

/** admin.live() as Postgres returned it, checked here and parsed again by the browser. */
export async function getLiveRow(supabase: SupabaseClient): Promise<z.infer<typeof liveRow>> {
  const { data, error } = await supabase.schema('admin').rpc('live')
  if (error) throw error
  return liveRow.parse(data)
}

export interface Rates {
  seconds: number
  commitsPerSec: number
  rollbacksPerSec: number
  rowsReadPerSec: number
  rowsWrittenPerSec: number
  /** Share of block reads served from shared buffers in the interval; null with no reads. */
  hitRatio: number | null
}

/** Per-second rates between two samples. Null when the counters went backwards, which is a
 *  stats reset or a restart, not negative traffic. */
export function rates(prev: LiveSample, cur: LiveSample): Rates | null {
  const seconds = (Date.parse(cur.at) - Date.parse(prev.at)) / 1000
  const d = (k: keyof LiveSample['counters']) => cur.counters[k] - prev.counters[k]
  const keys = ['commits', 'rollbacks', 'rowsReturned', 'rowsWritten', 'blocksHit', 'blocksRead'] as const
  if (seconds <= 0 || keys.some((k) => d(k) < 0)) return null
  const hits = d('blocksHit')
  const reads = hits + d('blocksRead')
  return {
    seconds,
    commitsPerSec: d('commits') / seconds,
    rollbacksPerSec: d('rollbacks') / seconds,
    rowsReadPerSec: d('rowsReturned') / seconds,
    rowsWrittenPerSec: d('rowsWritten') / seconds,
    hitRatio: reads > 0 ? hits / reads : null,
  }
}

const slowRow = z.object({
  query: z.string(),
  role: z.string(),
  calls: z.number(),
  total_ms: z.number(),
  mean_ms: z.number(),
  max_ms: z.number(),
  rows: z.number(),
  hit_ratio: z.number().nullable(),
})

export interface SlowQuery {
  query: string
  role: string
  calls: number
  totalMs: number
  meanMs: number
  maxMs: number
  rows: number
  hitRatio: number | null
}

export function parseSlowQueries(raw: unknown): SlowQuery[] {
  return z.array(slowRow).parse(raw).map((x) => ({
    query: x.query, role: x.role, calls: x.calls, totalMs: x.total_ms, meanMs: x.mean_ms,
    maxMs: x.max_ms, rows: x.rows, hitRatio: x.hit_ratio,
  }))
}

export async function getSlowQueries(supabase: SupabaseClient, limit = 10): Promise<SlowQuery[]> {
  const { data, error } = await supabase.schema('admin').rpc('slow_queries', { p_limit: limit })
  if (error) throw error
  return parseSlowQueries(data)
}

/* ---------- Host and containers, from one SSM command ---------- */

/** Each section starts with a `### name` line so the parser needs no JSON on the host. */
export const HOST_SCRIPT = [
  "echo '### inspect'; docker inspect --format '{{.Name}}|{{.Config.Image}}|{{.State.Status}}|{{.State.StartedAt}}|{{.RestartCount}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}' $(docker ps -aq)",
  "echo '### stats'; docker stats --no-stream --format '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}'",
  "echo '### mem'; free -b | awk '/Mem:/{print $2, $3, $7}'",
  "echo '### disk'; df -B1 --output=size,used,avail / | tail -1",
  "echo '### load'; cat /proc/loadavg",
  "echo '### uptime'; cat /proc/uptime",
  "echo '### cpus'; nproc",
].join('\n')

/** Containers in infra/supabase/docker-compose.yml, by the suffix after `supabase-`. */
export const LOG_SERVICES = ['db', 'auth', 'rest', 'envoy', 'meta', 'studio'] as const

const LOG_KEEP = 22_000

/** Newest last, both streams, timestamps from docker. SSM returns only the first 24,000
 *  characters and auth writes 45,237 in 200 lines (measured), so the host keeps the tail
 *  and prints the full length first. */
export function logScript(service: string): string {
  if (!LOG_SERVICES.some((s) => s === service)) throw new Error(`unknown service ${service}`)
  return [
    `out="$(docker logs --since 15m --tail 200 --timestamps supabase-${service} 2>&1)"`,
    'echo "${#out}"',
    `printf '%s\\n' "$out" | tail -c ${LOG_KEEP}`,
  ].join('\n')
}

export interface LogLine { at: string | null; text: string }

/** The output of `logScript`: a length line, then lines prefixed with docker's timestamp.
 *  `truncated` is true when the oldest lines were dropped to fit. */
export function parseLogs(stdout: string): { lines: LogLine[]; truncated: boolean } {
  const [first, ...rest] = stdout.split('\n')
  const total = Number(first)
  const lines = rest.filter((l) => l.trim()).map((l): LogLine => {
    const m = l.match(/^(\d{4}-\d\d-\d\dT[\d:.]+Z) (.*)$/)
    return m ? { at: m[1], text: m[2] } : { at: null, text: l }
  })
  const truncated = Number.isFinite(total) && total > LOG_KEEP
  // The cut lands mid-line; that first fragment says nothing.
  if (truncated && lines[0]?.at === null) lines.shift()
  return { lines, truncated }
}

export interface ContainerState {
  name: string
  image: string
  status: string
  startedAt: string
  restarts: number
  health: string | null
  cpuPercent: number | null
  memBytes: number | null
  memLimitBytes: number | null
}

export interface HostSnapshot {
  containers: ContainerState[]
  memory: { total: number; used: number; available: number } | null
  disk: { size: number; used: number; available: number } | null
  load: [number, number, number] | null
  uptimeSeconds: number | null
  cpus: number | null
}

const UNIT: Record<string, number> = { B: 1, kB: 1e3, KB: 1e3, MB: 1e6, GB: 1e9, KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3 }

/** "208.7MiB" as docker stats prints it, in bytes. */
export function parseSize(s: string): number | null {
  const m = s.trim().match(/^([\d.]+)\s*([A-Za-z]+)$/)
  if (!m || !(m[2] in UNIT)) return null
  return Math.round(Number(m[1]) * UNIT[m[2]])
}

function sections(stdout: string): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  let key = ''
  for (const line of stdout.split('\n')) {
    const h = line.match(/^### (\w+)$/)
    if (h) { key = h[1]; out[key] = []; continue }
    if (key && line.trim()) out[key].push(line.trim())
  }
  return out
}

const nums = (line: string | undefined) => (line ?? '').split(/\s+/).map(Number).filter((n) => Number.isFinite(n))

export function parseHost(stdout: string): HostSnapshot {
  const s = sections(stdout)
  const stats = new Map((s.stats ?? []).map((l) => {
    const [name, cpu, mem] = l.split('|')
    const [used, limit] = (mem ?? '').split('/')
    return [name, {
      cpu: Number.parseFloat(cpu),
      used: used ? parseSize(used) : null,
      limit: limit ? parseSize(limit) : null,
    }]
  }))
  const containers = (s.inspect ?? []).map((l): ContainerState => {
    const [rawName, image, status, startedAt, restarts, health] = l.split('|')
    const name = rawName.replace(/^\//, '')
    const st = stats.get(name)
    return {
      name,
      image: image ?? '',
      status: status ?? 'unknown',
      startedAt: startedAt ?? '',
      restarts: Number(restarts) || 0,
      health: health || null,
      cpuPercent: st && Number.isFinite(st.cpu) ? st.cpu : null,
      memBytes: st?.used ?? null,
      memLimitBytes: st?.limit ?? null,
    }
  }).sort((a, b) => a.name.localeCompare(b.name))
  const mem = nums(s.mem?.[0])
  const disk = nums(s.disk?.[0])
  const load = nums(s.load?.[0])
  const up = nums(s.uptime?.[0])
  const cpus = nums(s.cpus?.[0])
  return {
    containers,
    memory: mem.length === 3 ? { total: mem[0], used: mem[1], available: mem[2] } : null,
    disk: disk.length === 3 ? { size: disk[0], used: disk[1], available: disk[2] } : null,
    load: load.length >= 3 ? [load[0], load[1], load[2]] : null,
    uptimeSeconds: up[0] ?? null,
    cpus: cpus[0] ?? null,
  }
}

/* ---------- What the browser reads back from /api/admin/monitor ---------- */

const hostResponse = z.union([
  z.object({ enabled: z.literal(false) }),
  z.object({
    at: z.string(),
    containers: z.array(z.object({
      name: z.string(), image: z.string(), status: z.string(), startedAt: z.string(), restarts: z.number(),
      health: z.string().nullable(), cpuPercent: z.number().nullable(), memBytes: z.number().nullable(),
      memLimitBytes: z.number().nullable(),
    })),
    memory: z.object({ total: z.number(), used: z.number(), available: z.number() }).nullable(),
    disk: z.object({ size: z.number(), used: z.number(), available: z.number() }).nullable(),
    load: z.tuple([z.number(), z.number(), z.number()]).nullable(),
    uptimeSeconds: z.number().nullable(),
    cpus: z.number().nullable(),
  }),
])

export type HostResponse = { enabled: false } | (HostSnapshot & { at: string })

export function parseHostResponse(raw: unknown): HostResponse {
  return hostResponse.parse(raw)
}

const logsResponse = z.union([
  z.object({ enabled: z.literal(false) }),
  z.object({
    at: z.string(),
    service: z.string(),
    lines: z.array(z.object({ at: z.string().nullable(), text: z.string() })),
    truncated: z.boolean(),
  }),
])

export type LogsResponse = { enabled: false } | { at: string; service: string; lines: LogLine[]; truncated: boolean }

export function parseLogsResponse(raw: unknown): LogsResponse {
  return logsResponse.parse(raw)
}
