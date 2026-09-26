import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GetParametersCommand } from '@aws-sdk/client-ssm'

const { send } = vi.hoisted(() => ({ send: vi.fn() }))
vi.mock('@/lib/admin/ssm', async (orig) => ({
  ...(await orig<typeof import('@/lib/admin/ssm')>()),
  clients: () => ({ ssm: { send }, ec2: {}, sns: {} }),
}))

import { APP_PARAMETERS, CACHE_MS, resetRuntimeEnv, runtimeEnv } from '@/lib/secrets'

const ROLE = 'arn:aws:iam::014498663963:role/zhesen-vercel-health'
const ENV = ['AWS_ROLE_ARN', 'AI_API_KEY', 'AI_BASE_URL', 'REVALIDATE_SECRET'] as const
const saved: Record<string, string | undefined> = {}

function ssmHas(values: Record<string, string>) {
  send.mockImplementation(async (cmd: unknown) => {
    if (!(cmd instanceof GetParametersCommand)) throw new Error('unexpected command')
    const names = cmd.input.Names ?? []
    return {
      Parameters: names.filter((n) => n in values).map((n) => ({ Name: n, Value: values[n], Type: 'SecureString' })),
      InvalidParameters: names.filter((n) => !(n in values)),
    }
  })
}

beforeEach(() => {
  for (const k of ENV) saved[k] = process.env[k]
  process.env.AWS_ROLE_ARN = ROLE
  process.env.AI_API_KEY = 'from-env'
  process.env.AI_BASE_URL = 'http://env.test/v1'
  delete process.env.REVALIDATE_SECRET
  send.mockReset()
  resetRuntimeEnv()
})
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('runtimeEnv', () => {
  it('prefers the SSM parameter over the env var of the same key', async () => {
    ssmHas({ [APP_PARAMETERS.AI_API_KEY]: 'from-ssm' })
    const env = await runtimeEnv()
    expect(env.AI_API_KEY).toBe('from-ssm')
    expect(env.AI_BASE_URL).toBe('http://env.test/v1')
    expect(env.REVALIDATE_SECRET).toBeUndefined()
  })

  it('asks for the whole set in one GetParameters call of at most ten names', async () => {
    ssmHas({})
    await runtimeEnv()
    expect(send).toHaveBeenCalledTimes(1)
    const cmd = send.mock.calls[0][0] as GetParametersCommand
    expect(cmd.input.Names).toEqual(Object.values(APP_PARAMETERS))
    expect(cmd.input.Names?.length).toBeLessThanOrEqual(10)
    expect(cmd.input.WithDecryption).toBe(true)
  })

  it('reads only the env vars when AWS is not configured', async () => {
    delete process.env.AWS_ROLE_ARN
    expect((await runtimeEnv()).AI_API_KEY).toBe('from-env')
    expect(send).not.toHaveBeenCalled()
  })

  it('falls back to the env vars when SSM fails', async () => {
    send.mockRejectedValue(Object.assign(new Error('denied'), { name: 'AccessDeniedException' }))
    expect((await runtimeEnv()).AI_API_KEY).toBe('from-env')
  })

  it('keeps one answer for the cache window and asks again after it', async () => {
    ssmHas({ [APP_PARAMETERS.AI_API_KEY]: 'first' })
    const t0 = 1_000_000
    expect((await runtimeEnv(t0)).AI_API_KEY).toBe('first')
    ssmHas({ [APP_PARAMETERS.AI_API_KEY]: 'second' })
    expect((await runtimeEnv(t0 + CACHE_MS - 1)).AI_API_KEY).toBe('first')
    expect(send).toHaveBeenCalledTimes(1)
    expect((await runtimeEnv(t0 + CACHE_MS)).AI_API_KEY).toBe('second')
    expect(send).toHaveBeenCalledTimes(2)
  })

  // The env half is read on every call, so a test or a Vercel change to it is never stale.
  it('reads the env vars fresh while the SSM answer is cached', async () => {
    ssmHas({})
    await runtimeEnv(5)
    process.env.AI_API_KEY = 'changed'
    expect((await runtimeEnv(6)).AI_API_KEY).toBe('changed')
  })
})
