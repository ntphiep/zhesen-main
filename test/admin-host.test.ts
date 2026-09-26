import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { containerCpuPercent, memBytes, readHost, series, snapshot, type Sample } from '@/lib/admin/host'
import { parseContainersResponse, parseHostResponse } from '@/lib/admin/monitor'

const { adminUser, rpc, runShell } = vi.hoisted(() => ({ adminUser: vi.fn(), rpc: vi.fn(), runShell: vi.fn() }))
vi.mock('@/lib/auth/admin', () => ({ adminUser }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ schema: () => ({ rpc }) }) }))
vi.mock('@/lib/admin/ssm', async (orig) => ({
  ...(await orig<typeof import('@/lib/admin/ssm')>()),
  clients: () => ({ ssm: {}, ec2: {}, sns: {} }),
  runShell,
}))

import { GET } from '@/app/api/admin/monitor/route'

/** One container as the sampler wrote it against a local Docker daemon, 2026-09-26. */
const INSPECT = {
  name: 'zhesen-staging-db', image: 'supabase/postgres:17.6.1.136', service: null, status: 'running',
  started_at: '2026-09-26T09:50:09.455164662Z', restarts: 0, health: 'healthy',
  health_log: { exit_code: 0, output: 'localhost:5432 - accepting connections', at: '2026-09-26T10:14:52.725460839Z' },
  ports: ['5432/tcp -> 127.0.0.1:54329'],
  mounts: [{ type: 'volume', source: '/var/lib/docker/volumes/zhesen-staging-pg/_data', destination: '/var/lib/postgresql/data', rw: true }],
  nano_cpus: 0,
}
const RECORDED = {
  ...INSPECT, cpu_usage: 75581993000, cpu_system: 23944140000000, online_cpus: 16, mem_usage: 1478000640,
  mem_inactive: 314208256, mem_limit: 8325328896, net_rx: 1740, net_tx: 126, blk_read: 3088760832,
  blk_write: 2046103552, pids: 6,
}

const HOST: Sample['host'] = {
  cpu_busy: 1000, cpu_total: 10000, cpus: 2, mem_total: 4_000_000_000, mem_available: 3_000_000_000,
  disk_size: 30_000_000_000, disk_used: 12_000_000_000, disk_available: 18_000_000_000,
  load: [0.19, 0.22, 0.19], uptime: 174793.75, net_rx: 1_000_000, net_tx: 2_000_000,
}

/** Two rows 5 s apart: 100 of 400 jiffies busy, the db container 0.1 s of CPU on 2 cores. */
function rows(newestAt: number): Sample[] {
  const t0 = new Date(newestAt - 5000).toISOString().replace('Z', '+00:00')
  const t1 = new Date(newestAt).toISOString().replace('Z', '+00:00')
  const db = { ...RECORDED, name: 'supabase-db', online_cpus: 2, nano_cpus: 1_500_000_000 }
  const stopped = { ...INSPECT, name: 'supabase-meta', status: 'exited', health: null, health_log: null }
  return [
    { at: t0, host: HOST, containers: [db, stopped] },
    {
      at: t1,
      host: { ...HOST, cpu_busy: 1100, cpu_total: 10400, net_rx: 1_005_000, net_tx: 2_010_000 },
      containers: [stopped, {
        ...db, cpu_usage: db.cpu_usage + 100_000_000, cpu_system: db.cpu_system + 10_000_000_000,
        net_rx: db.net_rx + 500, blk_write: db.blk_write + 50_000,
      }],
    },
  ]
}

const get = (part: string) => GET(new Request(`http://localhost/api/admin/monitor?part=${part}`))

const HOST_OUT = `### inspect
/supabase-db|supabase/postgres:17.6.1.136|running|2026-09-22T18:23:28.669817878Z|0|healthy
### stats
supabase-db|2.27%|483.1MiB / 3.734GiB
### mem
4009828352 1469038592 2540789760
`

beforeEach(() => {
  rpc.mockReset()
  runShell.mockReset().mockResolvedValue({ status: 'Success', exitCode: 0, stdout: HOST_OUT, stderr: '', truncated: false, ms: 3500 })
  adminUser.mockReset().mockResolvedValue({ id: 'bcfc744d-d41b-443b-b0e3-5556ac0cb1fb' })
  vi.stubEnv('AWS_ROLE_ARN', 'arn:aws:iam::123456789012:role/zhesen-vercel')
})

afterEach(() => { vi.unstubAllEnvs() })

describe('sampler rows', () => {
  it('reads memory as usage less inactive page cache, as docker stats does', () => {
    expect(memBytes(RECORDED)).toBe(1478000640 - 314208256)
  })

  it('computes host CPU, container CPU with docker\'s formula, and per-second rates', () => {
    const [prev, cur] = rows(Date.parse('2026-09-26T10:00:05Z'))
    const s = snapshot(prev, cur)
    expect(s).toMatchObject({ source: 'sampler', cpuPercent: 25, net: { rxBps: 1000, txBps: 2000 }, cpus: 2, load: [0.19, 0.22, 0.19] })
    expect(s.memory).toEqual({ total: 4_000_000_000, used: 1_000_000_000, available: 3_000_000_000 })
    expect(s.containers.map((c) => c.name)).toEqual(['supabase-db', 'supabase-meta'])
    const [db, meta] = s.containers
    // 0.1 s of CPU in 10 s of host CPU time, times 2 cores: 2 %.
    expect(db.cpuPercent).toBeCloseTo(2, 10)
    expect(db).toMatchObject({
      cpuLimit: 1.5, memBytes: 1478000640 - 314208256, netRxBps: 100, netTxBps: 0, blkReadBps: 0, blkWriteBps: 10_000,
      pids: 6, ports: ['5432/tcp -> 127.0.0.1:54329'],
      healthLog: { exitCode: 0, output: 'localhost:5432 - accepting connections', at: '2026-09-26T10:14:52.725460839Z' },
    })
    expect(meta).toMatchObject({ status: 'exited', cpuPercent: null, memBytes: null, netRxBps: null, pids: null, healthLog: null })
    expect(parseHostResponse(JSON.parse(JSON.stringify(s)))).toMatchObject({ source: 'sampler' })
  })

  it('reports no CPU for a counter that went backwards, which is a restart', () => {
    const [prev, cur] = rows(Date.parse('2026-09-26T10:00:05Z'))
    const [, db] = cur.containers
    expect(containerCpuPercent(prev.containers[0], { ...db, cpu_usage: 1000 })).toBeNull()
    expect(containerCpuPercent(undefined, db)).toBeNull()
  })

  it('gives one point per row, with no CPU on the first', () => {
    const r = rows(Date.parse('2026-09-26T10:00:05Z'))
    const out = series(r)
    expect(out.host.map((p) => p.cpu)).toEqual([null, 25])
    expect(out.host[1].mem).toBe(1_000_000_000)
    expect(out.series.map((s) => s.name)).toEqual(['supabase-db', 'supabase-meta'])
    expect(out.series[0].points[1].cpu).toBeCloseTo(2, 10)
    expect(out.series[1].points).toEqual([{ t: r[0].at, cpu: null, mem: null }, { t: r[1].at, cpu: null, mem: null }])
  })
})

describe('readHost', () => {
  const newest = Date.parse('2026-09-26T10:00:05Z')

  it('asks for the last 30 s of full rows', async () => {
    rpc.mockResolvedValue({ data: rows(newest), error: null })
    expect(await readHost({ schema: () => ({ rpc }) } as never, newest + 1000)).toMatchObject({ source: 'sampler', cpuPercent: 25 })
    expect(rpc).toHaveBeenCalledWith('host_samples_since', { p_since: '2026-09-26T09:59:36.000Z', p_slim: false })
  })

  it('returns null when the newest row is older than 20 s', async () => {
    rpc.mockResolvedValue({ data: rows(newest), error: null })
    expect(await readHost({ schema: () => ({ rpc }) } as never, newest + 20_001)).toBeNull()
  })

  it('still answers from a single fresh row, without rates', async () => {
    rpc.mockResolvedValue({ data: rows(newest).slice(1), error: null })
    const s = await readHost({ schema: () => ({ rpc }) } as never, newest)
    expect(s).toMatchObject({ cpuPercent: null, net: null })
    expect(s?.containers[0].cpuPercent).toBeNull()
  })
})

describe('GET /api/admin/monitor, host and containers', () => {
  it('answers part=host from fresh sampler rows without calling SSM', async () => {
    rpc.mockResolvedValue({ data: rows(Date.now() - 2000), error: null })
    const res = await get('host')
    expect(res.status).toBe(200)
    expect(parseHostResponse(await res.json())).toMatchObject({ source: 'sampler', cpuPercent: 25 })
    expect(runShell).not.toHaveBeenCalled()
  })

  it('falls back to SSM when the newest row is stale', async () => {
    rpc.mockResolvedValue({ data: rows(Date.now() - 25_000), error: null })
    const body = parseHostResponse(await (await get('host')).json())
    expect(body).toMatchObject({ source: 'ssm', cpuPercent: null })
    expect(runShell).toHaveBeenCalledTimes(1)
  })

  it('falls back to SSM when the read fails, as before the migration is applied', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function admin.host_samples_since' } })
    expect(parseHostResponse(await (await get('host')).json())).toMatchObject({ source: 'ssm' })
  })

  it('answers part=containers with the snapshot and the hour of points', async () => {
    rpc.mockResolvedValue({ data: rows(Date.now() - 2000), error: null })
    const body = parseContainersResponse(await (await get('containers')).json())
    if ('enabled' in body) throw new Error('expected a snapshot')
    expect(body.source).toBe('sampler')
    expect(body.containers.map((c) => c.name)).toEqual(['supabase-db', 'supabase-meta'])
    expect(body.series.map((s) => s.points.length)).toEqual([2, 2])
    expect(body.host.map((p) => p.cpu)).toEqual([null, 25])
    expect(rpc).toHaveBeenCalledWith('host_samples_since', expect.objectContaining({ p_slim: true }))
    expect(runShell).not.toHaveBeenCalled()
  })

  it('answers part=containers from SSM with no series when the rows are stale', async () => {
    rpc.mockResolvedValue({ data: rows(Date.now() - 60_000), error: null })
    const body = parseContainersResponse(await (await get('containers')).json())
    expect(body).toMatchObject({ source: 'ssm', series: [], host: [] })
    if ('enabled' in body) throw new Error('expected a snapshot')
    expect(body.containers[0]).toMatchObject({ name: 'supabase-db', cpuPercent: 2.27, service: null })
  })

  it('answers enabled: false when the rows are stale and AWS is not configured', async () => {
    vi.stubEnv('AWS_ROLE_ARN', '')
    rpc.mockResolvedValue({ data: [], error: null })
    expect(await (await get('containers')).json()).toEqual({ enabled: false })
  })
})

const python = ['python3', 'python'].find((cmd) => spawnSync(cmd, ['--version']).status === 0)

describe.skipIf(!python)('sampler.py', () => {
  it('parses /proc/stat, /proc/meminfo and /proc/net/dev', () => {
    const check = [
      'import sys; sys.path.insert(0, "infra/supabase/sampler"); import sampler as s',
      'assert s.parse_stat("cpu  100 5 50 800 40 3 2 0 0 0\\ncpu0 1 2 3 4\\ncpu1 1 2 3 4\\nctxt 9\\n") == (160, 1000, 2)',
      'assert s.parse_meminfo("MemTotal:  4000 kB\\nMemFree: 1 kB\\nMemAvailable:  3000 kB\\n") == (4096000, 3072000)',
      'dev = "h1\\nh2\\n    lo: 9 0 0 0 0 0 0 0 9 0 0 0 0 0 0 0\\n  ens5: 100 0 0 0 0 0 0 0 200 0 0 0 0 0 0 0\\nveth1: 7 0 0 0 0 0 0 0 7 0 0 0 0 0 0 0\\n"',
      'assert s.parse_net_dev(dev) == (100, 200)',
    ].join('\n')
    // -B: a __pycache__ folder would ride along to the instance in the assets bucket.
    const out = spawnSync(python!, ['-B', '-c', check], { encoding: 'utf8' })
    expect(out.stderr).toBe('')
    expect(out.status).toBe(0)
  })
})
