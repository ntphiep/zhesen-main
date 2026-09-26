import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/containers' }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { getSession: vi.fn() } }) }))

import { ContainerBoard } from '@/components/admin/ContainerBoard'
import { AdminNav } from '@/components/admin/AdminNav'
import { parseHost, type ContainerState } from '@/lib/admin/monitor'

const AT = '2026-09-26T03:00:00.000Z'
const MIB = 1024 ** 2

const full = (over: Partial<ContainerState> & { name: string }): ContainerState => ({
  image: 'supabase/postgres:17.6.1.136', status: 'running', startedAt: '2026-09-23T03:00:00Z', restarts: 0,
  health: 'healthy', cpuPercent: 2.27, memBytes: 483 * MIB, memLimitBytes: 4096 * MIB, service: null, cpuLimit: null,
  netRxBps: 1536, netTxBps: 512, netRxBytes: 2 * 1024 ** 3, netTxBytes: 300 * MIB, blkReadBps: 0, blkWriteBps: 12_288,
  pids: 42, ports: [], mounts: [], healthLog: null,
  ...over,
})

const points = (cpu: number[], mem: number) => cpu.map((c, i) => ({ t: `2026-09-26T02:59:${String(i * 5).padStart(2, '0')}Z`, cpu: c, mem }))

/** The shape the sampler route answers with; names as docker-compose.yml sets them. */
const SAMPLER = {
  at: AT,
  source: 'sampler',
  containers: [
    full({ name: 'supabase-studio', image: 'supabase/studio:2026.09.07-sha-7996410', health: 'unhealthy', restarts: 2 }),
    full({ name: 'zhesen-sampler', image: 'zhesen/sampler:1', status: 'exited', health: null }),
    full({
      name: 'supabase-db', service: 'db', cpuLimit: 1.5,
      ports: ['5432/tcp'],
      mounts: [{ type: 'bind', source: '/opt/zhesen/volumes/db/data', destination: '/var/lib/postgresql/data', rw: true }],
      healthLog: { exitCode: 0, output: '/var/run/postgresql:5432 - accepting connections\n', at: '2026-09-26T02:59:55Z' },
    }),
    full({ name: 'supabase-envoy', service: 'api-gw', image: 'envoyproxy/envoy:v1.39.1' }),
  ],
  series: [{ name: 'supabase-db', points: points([1, 3, 2.27], 483 * MIB) }],
  host: points([12, 18, 15.5], 1400 * MIB),
}

/** HOST_SCRIPT's output with two containers, as the SSM fallback reads it. */
const SSM = {
  at: AT,
  source: 'ssm',
  containers: parseHost(`### inspect
/supabase-db|supabase/postgres:17.6.1.136|running|2026-09-22T18:23:28Z|0|healthy
/supabase-rest|postgrest/postgrest:v14.17|exited|2026-09-24T18:17:06Z|3|
### stats
supabase-db|2.27%|483.1MiB / 3.734GiB
`).containers,
  series: [],
  host: [],
}

const fetchMock = vi.fn()
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })

function serve(board: unknown) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('part=containers')) return ok(board)
    if (url.includes('part=logs')) return ok({ at: AT, service: 'db', lines: [{ at: AT, text: 'LOG: checkpoint starting' }], truncated: false })
    return ok({ status: 'Success', exitCode: 0, stdout: '2026-09-26T03:00:04Z', stderr: '', truncated: false, ms: 4000 })
  })
}

const card = (name: string) => screen.getByRole('heading', { name }).closest('li') as HTMLElement

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('ContainerBoard', () => {
  it('puts the compose services first in their order, then the rest by name', async () => {
    serve(SAMPLER)
    render(<ContainerBoard />)
    await screen.findByRole('heading', { name: 'supabase-db' })
    expect(screen.getAllByRole('heading').map((h) => h.textContent)).toEqual([
      'supabase-db', 'supabase-envoy', 'supabase-studio', 'zhesen-sampler',
    ])
    expect(screen.getByText(/^Updated \d\d:\d\d:\d\d · every 5 s$/)).toBeInTheDocument()
  })

  it('formats the sampler numbers and draws the last hour', async () => {
    serve(SAMPLER)
    render(<ContainerBoard />)
    await screen.findByRole('heading', { name: 'supabase-db' })
    const db = within(card('supabase-db'))
    expect(db.getByText('2.3%')).toBeInTheDocument()
    expect(db.getByText('483 MB')).toBeInTheDocument()
    expect(db.getByText('of 4.0 GB')).toBeInTheDocument()
    expect(db.getByRole('meter', { name: 'supabase-db memory' })).toHaveAttribute('aria-valuenow', '12')
    expect(db.getByText('1.5 kB/s in · 512 B/s out')).toBeInTheDocument()
    expect(db.getByText('2.0 GB in · 300 MB out')).toBeInTheDocument()
    expect(db.getByText('0 B/s read · 12 kB/s write')).toBeInTheDocument()
    expect(db.getByText('42')).toBeInTheDocument()
    expect(db.getByText('1.5 cores')).toBeInTheDocument()
    expect(db.getByText('up 3 d 0 h')).toBeInTheDocument()
    expect(db.getByRole('img', { name: 'supabase-db CPU, last hour' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Host CPU, last hour' })).toBeInTheDocument()
    expect(screen.getByText('15.5%')).toBeInTheDocument()
    expect(screen.getByText('3 / 4')).toBeInTheDocument()
    expect(within(card('supabase-studio')).getByText('unhealthy')).toBeInTheDocument()
    expect(within(card('supabase-studio')).getByText('2 restarts')).toBeInTheDocument()
    expect(screen.queryByText(/Sampler offline/)).not.toBeInTheDocument()
  })

  it('lists ports, mounts and the last healthcheck under Details', async () => {
    serve(SAMPLER)
    render(<ContainerBoard />)
    await screen.findByRole('heading', { name: 'supabase-db' })
    const db = within(card('supabase-db'))
    expect(db.getByText('Details')).toBeInTheDocument()
    expect(db.getByText('5432/tcp')).toBeInTheDocument()
    expect(db.getByText('bind /opt/zhesen/volumes/db/data → /var/lib/postgresql/data rw')).toBeInTheDocument()
    expect(db.getByText('exit 0')).toBeInTheDocument()
    expect(db.getByText('/var/run/postgresql:5432 - accepting connections')).toBeInTheDocument()
    expect(within(card('supabase-envoy')).queryByText('Details')).not.toBeInTheDocument()
  })

  it('reads an SSM response without history and says so', async () => {
    serve(SSM)
    render(<ContainerBoard />)
    await screen.findByRole('heading', { name: 'supabase-db' })
    expect(screen.getByText('Sampler offline; showing a slower SSM read without history.')).toBeInTheDocument()
    expect(screen.queryAllByRole('img')).toHaveLength(0)
    expect(screen.queryByText('Details')).not.toBeInTheDocument()
    expect(screen.queryByText('Network')).not.toBeInTheDocument()
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
    expect(within(card('supabase-db')).getByText('2.3%')).toBeInTheDocument()
    const rest = within(card('supabase-rest'))
    expect(rest.getByText('exited')).toBeInTheDocument()
    expect(rest.getByText('3 restarts')).toBeInTheDocument()
    expect(rest.getAllByText('–')).toHaveLength(2)
  })

  it('offers restart and logs only for compose services', async () => {
    serve(SAMPLER)
    render(<ContainerBoard />)
    await screen.findByRole('heading', { name: 'supabase-db' })
    expect(within(card('zhesen-sampler')).queryByRole('button')).not.toBeInTheDocument()
    expect(within(card('supabase-studio')).getByRole('button', { name: 'Restart' })).toBeInTheDocument()
  })

  it('restarts behind GuardDialog with the container name as the target', async () => {
    serve(SAMPLER)
    render(<ContainerBoard />)
    await screen.findByRole('heading', { name: 'supabase-envoy' })
    await userEvent.click(within(card('supabase-envoy')).getByRole('button', { name: 'Restart' }))

    const dialog = screen.getByRole('dialog', { name: 'Restart supabase-envoy' })
    expect(within(dialog).getByText('The container stops for a few seconds; requests to it fail meanwhile.')).toBeInTheDocument()
    const confirm = within(dialog).getByRole('button', { name: 'Restart' })
    expect(confirm).toBeDisabled()
    await userEvent.type(within(dialog).getByRole('textbox'), 'supabase-envoy')
    await userEvent.click(confirm)

    const post = fetchMock.mock.calls.find(([url]) => url === '/api/admin/control')
    expect(JSON.parse(post?.[1].body)).toEqual({ action: 'restart', service: 'envoy', confirm: 'supabase-envoy' })
    expect(await screen.findByRole('status')).toHaveTextContent('Restart supabase-envoy: done')
  })

  it('opens that container’s logs and reads them at once', async () => {
    serve(SAMPLER)
    render(<ContainerBoard />)
    await screen.findByRole('heading', { name: 'supabase-db' })
    await userEvent.click(within(card('supabase-db')).getByRole('button', { name: 'Logs' }))
    const dialog = screen.getByRole('dialog', { name: 'supabase-db logs' })
    expect(await within(dialog).findByText('LOG: checkpoint starting')).toBeInTheDocument()
    expect(within(dialog).queryByRole('radiogroup')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/monitor?part=logs&service=db', { cache: 'no-store' })
  })
})

describe('AdminNav', () => {
  it('lists Containers under Observe, after Monitor', () => {
    render(<AdminNav />)
    const labels = screen.getAllByRole('link').map((a) => a.textContent)
    expect(labels.slice(0, 4)).toEqual(['Overview', 'Monitor', 'Containers', 'Database'])
    expect(screen.getByRole('link', { name: 'Containers' })).toHaveAttribute('href', '/admin/containers')
    expect(screen.getByRole('link', { name: 'Containers' })).toHaveAttribute('aria-current', 'page')
  })
})
