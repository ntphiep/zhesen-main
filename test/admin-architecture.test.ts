import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CONTAINERS, STACK, probeAuth } from '@/lib/admin/architecture'

vi.mock('@/lib/supabase/env', () => ({
  supabaseEnv: () => ({ url: 'https://edge.example.net', anonKey: 'anon' }),
}))

/** Every `container_name` and `image` pair in the compose file the instance runs. */
function composeContainers(): { container: string; image: string }[] {
  const text = readFileSync(join(process.cwd(), 'infra/supabase/docker-compose.yml'), 'utf8')
  const out: { container: string; image: string }[] = []
  let container: string | null = null
  for (const line of text.split('\n')) {
    const c = line.match(/^\s+container_name:\s*(\S+)/)
    if (c) container = c[1]
    const i = line.match(/^\s+image:\s*(\S+)/)
    if (i && container) {
      out.push({ container, image: i[1] })
      container = null
    }
  }
  return out
}

describe('CONTAINERS', () => {
  it('matches infra/supabase/docker-compose.yml image for image', () => {
    const listed = CONTAINERS.map(({ container, image }) => ({ container, image }))
    expect([...listed].sort((a, b) => a.container.localeCompare(b.container)))
      .toEqual(composeContainers().sort((a, b) => a.container.localeCompare(b.container)))
  })
})

describe('STACK', () => {
  it('reads every version from package.json', () => {
    for (const s of STACK) expect(s.version, s.name).toMatch(/\d/)
  })
})

describe('probeAuth', () => {
  it('reports the GoTrue version and the round trip', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ version: 'v2.197.0', name: 'GoTrue' }), { status: 200 }))
    const p = await probeAuth(f as unknown as typeof fetch)
    expect(p).toMatchObject({ ok: true, detail: 'GoTrue v2.197.0' })
    expect(f).toHaveBeenCalledWith('https://edge.example.net/auth/v1/health', expect.objectContaining({ headers: { apikey: 'anon' } }))
  })

  it('reads a gateway refusal as down, with the status', async () => {
    const f = vi.fn(async () => new Response('RBAC: access denied', { status: 403 }))
    expect(await probeAuth(f as unknown as typeof fetch)).toMatchObject({ ok: false, detail: 'HTTP 403' })
  })

  it('reads a network failure as down, with the error name', async () => {
    const f = vi.fn(async () => { throw new TypeError('fetch failed') })
    expect(await probeAuth(f as unknown as typeof fetch)).toMatchObject({ ok: false, detail: 'TypeError' })
  })
})
