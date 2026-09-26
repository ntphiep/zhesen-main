import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from '@/lib/zod'
import type { ContainerState, HostSnapshot, SeriesPoint } from '@/lib/admin/monitor'

/* ---------- Rows of admin.host_samples (migration 0072), written by infra/supabase/sampler ---------- */

/** Stat fields are absent on a container that is not running. */
const counter = z.number().nullish()

const counters = z.object({
  name: z.string(),
  cpu_usage: counter,
  cpu_system: counter,
  online_cpus: counter,
  mem_usage: counter,
  mem_inactive: counter,
})

const containerRow = counters.extend({
  image: z.string(),
  service: z.string().nullable(),
  status: z.string(),
  started_at: z.string(),
  restarts: z.number(),
  health: z.string().nullable(),
  health_log: z.object({ exit_code: z.number(), output: z.string(), at: z.string() }).nullable(),
  ports: z.array(z.string()),
  mounts: z.array(z.object({ type: z.string(), source: z.string(), destination: z.string(), rw: z.boolean() })),
  nano_cpus: z.number(),
  mem_limit: counter,
  net_rx: counter,
  net_tx: counter,
  blk_read: counter,
  blk_write: counter,
  pids: counter,
})

const hostCounters = z.object({ cpu_busy: z.number(), cpu_total: z.number(), mem_total: z.number(), mem_available: z.number() })

const hostRow = hostCounters.extend({
  cpus: z.number(),
  disk_size: z.number(),
  disk_used: z.number(),
  disk_available: z.number(),
  load: z.tuple([z.number(), z.number(), z.number()]),
  uptime: z.number(),
  net_rx: z.number(),
  net_tx: z.number(),
})

const sampleRow = z.object({ at: z.string(), host: hostRow, containers: z.array(containerRow) })
/** What `p_slim` returns: only the counters the one-hour charts need. */
const seriesRow = z.object({ at: z.string(), host: hostCounters, containers: z.array(counters) })

export type Sample = z.infer<typeof sampleRow>
type SeriesRow = z.infer<typeof seriesRow>
type Counters = z.infer<typeof counters>

/** The sampler writes every 5 s; older than this and the SSM read is the better answer. */
const FRESH_MS = 20_000

/* ---------- Math on two consecutive rows ---------- */

/** Null when either side is missing or the counter went backwards, which is a restart. */
function delta(prev: number | null | undefined, cur: number | null | undefined): number | null {
  if (prev == null || cur == null || cur < prev) return null
  return cur - prev
}

const perSecond = (d: number | null, seconds: number) => (d === null || seconds <= 0 ? null : d / seconds)

export function hostCpuPercent(prev: z.infer<typeof hostCounters>, cur: z.infer<typeof hostCounters>): number | null {
  const busy = delta(prev.cpu_busy, cur.cpu_busy)
  const total = delta(prev.cpu_total, cur.cpu_total)
  return busy === null || !total ? null : (busy / total) * 100
}

/** docker stats' formula, so 200 is two full cores, as the SSM read reports it. */
export function containerCpuPercent(prev: Counters | undefined, cur: Counters): number | null {
  const cpu = delta(prev?.cpu_usage, cur.cpu_usage)
  const system = delta(prev?.cpu_system, cur.cpu_system)
  if (cpu === null || !system || !cur.online_cpus) return null
  return (cpu / system) * cur.online_cpus * 100
}

/** Usage less the inactive page cache, which docker stats subtracts too. */
export function memBytes(c: Counters): number | null {
  return c.mem_usage == null ? null : c.mem_usage - (c.mem_inactive ?? 0)
}

function containerState(prev: Sample['containers'][number] | undefined, c: Sample['containers'][number], seconds: number): ContainerState {
  const rate = (k: 'net_rx' | 'net_tx' | 'blk_read' | 'blk_write') => perSecond(delta(prev?.[k], c[k]), seconds)
  return {
    name: c.name,
    image: c.image,
    status: c.status,
    startedAt: c.started_at,
    restarts: c.restarts,
    health: c.health,
    cpuPercent: containerCpuPercent(prev, c),
    memBytes: memBytes(c),
    memLimitBytes: c.mem_limit ?? null,
    service: c.service,
    cpuLimit: c.nano_cpus > 0 ? c.nano_cpus / 1e9 : null,
    netRxBps: rate('net_rx'),
    netTxBps: rate('net_tx'),
    netRxBytes: c.net_rx ?? null,
    netTxBytes: c.net_tx ?? null,
    blkReadBps: rate('blk_read'),
    blkWriteBps: rate('blk_write'),
    pids: c.pids ?? null,
    ports: c.ports,
    mounts: c.mounts,
    healthLog: c.health_log && { exitCode: c.health_log.exit_code, output: c.health_log.output, at: c.health_log.at },
  }
}

/** The newest row, with rates against the one before it when there is one. */
export function snapshot(prev: Sample | undefined, cur: Sample): HostSnapshot & { at: string } {
  const seconds = prev ? (Date.parse(cur.at) - Date.parse(prev.at)) / 1000 : 0
  const before = new Map(prev?.containers.map((c) => [c.name, c]))
  const h = cur.host
  const rx = perSecond(delta(prev?.host.net_rx, h.net_rx), seconds)
  const tx = perSecond(delta(prev?.host.net_tx, h.net_tx), seconds)
  return {
    at: cur.at,
    source: 'sampler',
    cpuPercent: prev ? hostCpuPercent(prev.host, h) : null,
    net: rx !== null && tx !== null ? { rxBps: rx, txBps: tx } : null,
    containers: cur.containers.map((c) => containerState(before.get(c.name), c, seconds)).sort((a, b) => a.name.localeCompare(b.name)),
    memory: { total: h.mem_total, used: h.mem_total - h.mem_available, available: h.mem_available },
    disk: { size: h.disk_size, used: h.disk_used, available: h.disk_available },
    load: h.load,
    uptimeSeconds: h.uptime,
    cpus: h.cpus,
  }
}

/** One point per row, CPU against the row before; the first point has no CPU. */
export function series(rows: SeriesRow[]): { series: { name: string; points: SeriesPoint[] }[]; host: SeriesPoint[] } {
  const host: SeriesPoint[] = []
  const byName = new Map<string, SeriesPoint[]>()
  rows.forEach((cur, i) => {
    const prev = rows[i - 1]
    host.push({ t: cur.at, cpu: prev ? hostCpuPercent(prev.host, cur.host) : null, mem: cur.host.mem_total - cur.host.mem_available })
    const before = new Map(prev?.containers.map((c) => [c.name, c]))
    for (const c of cur.containers) {
      const points = byName.get(c.name) ?? []
      points.push({ t: cur.at, cpu: containerCpuPercent(before.get(c.name), c), mem: memBytes(c) })
      byName.set(c.name, points)
    }
  })
  return {
    series: [...byName].map(([name, points]) => ({ name, points })).sort((a, b) => a.name.localeCompare(b.name)),
    host,
  }
}

/* ---------- Reads ---------- */

async function samplesSince(supabase: SupabaseClient, since: number, slim: boolean): Promise<unknown> {
  const { data, error } = await supabase.schema('admin').rpc('host_samples_since', {
    p_since: new Date(since).toISOString(),
    p_slim: slim,
  })
  if (error) throw error
  return data
}

/** Null when the newest row is older than FRESH_MS: the sampler is down or not deployed. */
export async function readHost(supabase: SupabaseClient, now: number = Date.now()): Promise<(HostSnapshot & { at: string }) | null> {
  // The newest row may be FRESH_MS old and the one before it 5 s older still.
  const rows = z.array(sampleRow).parse(await samplesSince(supabase, now - FRESH_MS - 10_000, false))
  const cur = rows.at(-1)
  if (!cur || now - Date.parse(cur.at) > FRESH_MS) return null
  return snapshot(rows.at(-2), cur)
}

export async function readContainerSeries(supabase: SupabaseClient, now: number = Date.now()): Promise<ReturnType<typeof series>> {
  return series(z.array(seriesRow).parse(await samplesSince(supabase, now - 3_600_000, true)))
}
