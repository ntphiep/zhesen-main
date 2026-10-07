import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('next/navigation', () => ({
  redirect: (to: string) => { throw new Error(`NEXT_REDIRECT ${to}`) },
}))

const { session } = vi.hoisted(() => ({ session: { user: null as object | null } }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: session.user } }) } }),
}))

// Every directory under app/practice is a mode, so a mode added later is covered too.
const MODES = readdirSync(resolve(__dirname, '../app/practice'), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)

async function open(mode: string): Promise<unknown> {
  const page: { default: () => unknown } = await import(`../app/practice/${mode}/page.tsx`)
  return page.default()
}

beforeEach(() => { session.user = null })

// #13: the sign-in door carried `/practice`, so the learner landed on the index, not the mode.
describe('practice mode pages, signed out', () => {
  it('finds the twelve modes', () => {
    expect(MODES).toHaveLength(12)
  })

  it.each(MODES)('sends /practice/%s to /login and back to the same mode', async (mode) => {
    await expect(open(mode)).rejects.toThrow(`NEXT_REDIRECT /login?next=%2Fpractice%2F${mode}`)
  })

  it.each(MODES)('sends an anonymous session on /practice/%s to /register and back to the mode', async (mode) => {
    session.user = { id: 'u-anon' }
    await expect(open(mode)).rejects.toThrow(`NEXT_REDIRECT /register?next=%2Fpractice%2F${mode}`)
  })
})

describe('practice index, signed out', () => {
  it('sends /practice to /login and back to the index', async () => {
    const page: { default: () => unknown } = await import('../app/practice/page')
    await expect(page.default()).rejects.toThrow('NEXT_REDIRECT /login?next=%2Fpractice')
  })
})
