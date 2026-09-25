import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  logScript, parseHost, parseHostResponse, parseLive, parseLogs, parseSlowQueries, rates, type LiveSample,
} from '@/lib/admin/monitor'
import { Chart, SlowQueries } from '@/components/admin/History'

/** HOST_SCRIPT's output on the production instance, 2026-09-25. */
const HOST_OUT = `### inspect
/supabase-studio|supabase/studio:2026.09.07-sha-7996410|running|2026-09-24T18:17:05.659690485Z|0|healthy
/supabase-auth|supabase/gotrue:v2.197.0|running|2026-09-24T18:17:06.166906015Z|0|healthy
/supabase-rest|postgrest/postgrest:v14.17|running|2026-09-24T18:17:06.334151128Z|0|healthy
/supabase-meta|supabase/postgres-meta:v0.99.0|running|2026-09-22T18:23:34.326244107Z|0|healthy
/supabase-db|supabase/postgres:17.6.1.136|running|2026-09-22T18:23:28.669817878Z|0|healthy
/supabase-envoy|envoyproxy/envoy:v1.39.1|running|2026-09-22T18:23:28.244507433Z|0|healthy
### stats
supabase-studio|13.71%|209.8MiB / 512MiB
supabase-auth|0.03%|12.44MiB / 256MiB
supabase-rest|0.58%|49.08MiB / 256MiB
supabase-meta|0.42%|123.5MiB / 256MiB
supabase-db|2.27%|483.1MiB / 3.734GiB
supabase-envoy|0.23%|24.84MiB / 256MiB
### mem
4009828352 1469038592 2540789760
### disk
30083776512 11730272256 18336727040
### load
0.19 0.22 0.19 2/388 508376
### uptime
174793.75 324190.77
### cpus
2
`

const LIVE = {
  at: '2026-09-25T02:00:00.000+00:00',
  max_connections: 100,
  connections: { idle: 14, active: 1 },
  running: [],
  lock_waits: 0,
  database: {
    bytes: 472063123, commits: 1000, rollbacks: 4, blocks_hit: 9900, blocks_read: 100,
    rows_returned: 50000, rows_written: 200, deadlocks: 0, stats_reset: null,
  },
}

const sample = (at: string, over: Partial<typeof LIVE.database>): LiveSample =>
  parseLive({ ...LIVE, at, database: { ...LIVE.database, ...over } })

describe('parseHost', () => {
  const h = parseHost(HOST_OUT)

  it('reads all six containers with their stats', () => {
    expect(h.containers.map((c) => c.name)).toEqual([
      'supabase-auth', 'supabase-db', 'supabase-envoy', 'supabase-meta', 'supabase-rest', 'supabase-studio',
    ])
    const db = h.containers.find((c) => c.name === 'supabase-db')
    expect(db).toMatchObject({
      image: 'supabase/postgres:17.6.1.136', status: 'running', health: 'healthy', restarts: 0, cpuPercent: 2.27,
    })
    expect(db?.memBytes).toBe(Math.round(483.1 * 1024 ** 2))
    expect(db?.memLimitBytes).toBe(Math.round(3.734 * 1024 ** 3))
  })

  it('reads memory, disk, load, uptime and cores', () => {
    expect(h.memory).toEqual({ total: 4009828352, used: 1469038592, available: 2540789760 })
    expect(h.disk).toEqual({ size: 30083776512, used: 11730272256, available: 18336727040 })
    expect(h.load).toEqual([0.19, 0.22, 0.19])
    expect(h.uptimeSeconds).toBe(174793.75)
    expect(h.cpus).toBe(2)
  })

  it('survives a stopped container with no stats line', () => {
    const out = parseHost('### inspect\n/supabase-rest|postgrest/postgrest:v14.17|exited|2026-09-24T18:17:06Z|3|\n### stats\n')
    expect(out.containers[0]).toMatchObject({ status: 'exited', restarts: 3, health: null, cpuPercent: null, memBytes: null })
    expect(out.memory).toBeNull()
  })

  it('round-trips through the browser parser', () => {
    expect(parseHostResponse(JSON.parse(JSON.stringify({ at: '2026-09-25T02:00:00Z', ...h })))).toMatchObject({ cpus: 2 })
    expect(parseHostResponse({ enabled: false })).toEqual({ enabled: false })
  })
})

describe('rates', () => {
  it('turns two samples 10 seconds apart into per-second rates', () => {
    const r = rates(
      sample('2026-09-25T02:00:00Z', {}),
      sample('2026-09-25T02:00:10Z', { commits: 1050, rows_returned: 52000, rows_written: 230, blocks_hit: 10890, blocks_read: 110 }),
    )
    expect(r).toMatchObject({ seconds: 10, commitsPerSec: 5, rollbacksPerSec: 0, rowsReadPerSec: 200, rowsWrittenPerSec: 3 })
    expect(r?.hitRatio).toBeCloseTo(0.99)
  })

  // A restart or pg_stat_reset() sends the counters back to zero.
  it('is null when a counter went backwards', () => {
    expect(rates(sample('2026-09-25T02:00:00Z', {}), sample('2026-09-25T02:00:10Z', { commits: 3 }))).toBeNull()
  })

  it('has no hit ratio when nothing was read', () => {
    expect(rates(sample('2026-09-25T02:00:00Z', {}), sample('2026-09-25T02:00:10Z', {}))?.hitRatio).toBeNull()
  })
})

describe('logs', () => {
  it('only builds a command for a known container', () => {
    expect(logScript('auth')).toContain('supabase-auth')
    expect(() => logScript('db; reboot')).toThrow()
  })

  it('splits docker timestamps from the text', () => {
    const out = parseLogs('120\n2026-09-24T18:39:25.069871183Z LOG:  checkpoint starting: time\n\tcontinued\n')
    expect(out.truncated).toBe(false)
    expect(out.lines).toEqual([
      { at: '2026-09-24T18:39:25.069871183Z', text: 'LOG:  checkpoint starting: time' },
      { at: null, text: '\tcontinued' },
    ])
  })

  // auth wrote 39,220 characters in 15 minutes on 2026-09-25; the host keeps the last 22,000.
  it('drops the cut first line when the tail was trimmed', () => {
    const out = parseLogs('39220\nth.","time":"2026-09-24T18:32:46Z"}\n2026-09-24T18:32:46.876768815Z {"msg":"request completed"}\n')
    expect(out.truncated).toBe(true)
    expect(out.lines).toEqual([{ at: '2026-09-24T18:32:46.876768815Z', text: '{"msg":"request completed"}' }])
  })
})

describe('Chart', () => {
  it('states the latest value and the peak', () => {
    render(<Chart range="24h" s={{ id: 'cpu', label: 'CPU', unit: '%', points: [
      { t: '2026-09-25T00:00:00Z', v: 4 }, { t: '2026-09-25T00:05:00Z', v: 31.2 }, { t: '2026-09-25T00:10:00Z', v: 6 },
    ] }} />)
    expect(screen.getByText('6%')).toBeTruthy()
    expect(screen.getByText(/peak 31.2%/)).toBeTruthy()
  })

  it('says so when CloudWatch has no points', () => {
    render(<Chart range="7d" s={{ id: 'mem', label: 'Memory used', unit: '%', points: [] }} />)
    expect(screen.getByText(/No CloudWatch datapoints/)).toBeTruthy()
  })
})

describe('SlowQueries', () => {
  // The top row of admin.slow_queries() on production, 2026-09-24, query text shortened.
  const rows = parseSlowQueries([{
    query: 'WITH pgrst_source AS (...)', role: 'anon', calls: 34204, total_ms: 708112.4, mean_ms: 20.7,
    max_ms: 912.3, rows: 34204, hit_ratio: 0.9999,
  }])

  it('reads the total in seconds and the call count', () => {
    render(<SlowQueries rows={rows} />)
    expect(screen.getByText('708 s total')).toBeTruthy()
    expect(screen.getByText('34,204 calls')).toBeTruthy()
    expect(screen.getByText('role anon')).toBeTruthy()
  })
})

const { adminUser, rpc } = vi.hoisted(() => ({ adminUser: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/auth/admin', () => ({ adminUser }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ schema: () => ({ rpc }) }) }))

import { GET } from '@/app/api/admin/monitor/route'

const get = (query: string) => GET(new Request(`http://localhost/api/admin/monitor?${query}`))

describe('GET /api/admin/monitor', () => {
  const original = process.env.AWS_ROLE_ARN
  beforeEach(() => {
    rpc.mockReset()
    adminUser.mockReset().mockResolvedValue({ id: 'admin' })
    delete process.env.AWS_ROLE_ARN
  })
  afterEach(() => {
    if (original !== undefined) process.env.AWS_ROLE_ARN = original
  })

  it('answers 404 to a non-admin and reads nothing', async () => {
    adminUser.mockResolvedValue(null)
    expect((await get('part=live')).status).toBe(404)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refuses an unknown part or container', async () => {
    expect((await get('part=shell')).status).toBe(400)
    expect((await get('part=logs&service=db;reboot')).status).toBe(400)
  })

  // The browser runs parseLive on this body, so it must stay in the database's shape.
  it('returns admin.live() checked, uncached, and readable by the browser parser', async () => {
    rpc.mockResolvedValue({ data: LIVE, error: null })
    const res = await get('part=live')
    expect(rpc).toHaveBeenCalledWith('live')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(parseLive(await res.json())).toMatchObject({ maxConnections: 100, counters: { commits: 1000 } })
  })

  it('refuses a payload that is not admin.live()', async () => {
    rpc.mockResolvedValue({ data: { at: 'now' }, error: null })
    expect((await get('part=live')).status).toBe(502)
  })

  it('keeps the Postgres error out of the response', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'admin only' } })
    const res = await get('part=live')
    expect(res.status).toBe(502)
    expect(await res.text()).not.toContain('admin only')
  })

  it('reports the host as not configured without an AWS role', async () => {
    await expect((await get('part=host')).json()).resolves.toEqual({ enabled: false })
  })
})
