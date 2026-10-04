import { describe, it, expect, vi, beforeEach } from 'vitest'

const { exchange } = vi.hoisted(() => ({ exchange: vi.fn() }))
vi.mock('@vercel/oidc-aws-credentials-provider', () => ({ awsCredentialsProvider: () => exchange }))

import { clearShared, shared } from '@/lib/admin/shared'
import { roleCredentials } from '@/lib/admin/aws'

describe('shared', () => {
  it('runs one read for every request inside the window, and says when it started', async () => {
    const read = shared<number>('metrics', 60_000)
    const load = vi.fn(async () => 7)
    const [a, b] = await Promise.all([read(load, 1_000), read(load, 1_500)])
    expect(load).toHaveBeenCalledTimes(1)
    expect(a).toEqual({ value: 7, at: new Date(1_000) })
    expect(b.at).toEqual(new Date(1_000))
    await read(load, 61_000)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('drops a failed read so the next request tries again', async () => {
    const read = shared<number>('metrics', 60_000)
    await expect(read(async () => { throw new Error('57014') }, 0)).rejects.toThrow('57014')
    await expect(read(async () => 3, 10)).resolves.toMatchObject({ value: 3 })
  })

  it('reads again after clearShared, in every module copy of the same read', async () => {
    // Pages and route handlers each load their own copy of this module.
    const page = shared<number>('dictionary', 60_000)
    const otherPage = shared<number>('dictionary', 60_000)
    await page(async () => 1, 0)
    await otherPage(async () => 1, 0)
    clearShared('dictionary')
    await expect(page(async () => 2, 10)).resolves.toMatchObject({ value: 2 })
    await expect(otherPage(async () => 2, 10)).resolves.toMatchObject({ value: 2 })
    await expect(page(async () => 3, 20)).resolves.toMatchObject({ value: 2 })
  })
})

describe('roleCredentials', () => {
  const ROLE = 'arn:aws:iam::123456789012:role/zhesen-vercel'
  const creds = (expiresAt: number) => ({ accessKeyId: 'AKIA', secretAccessKey: 's', expiration: new Date(expiresAt) })

  beforeEach(() => exchange.mockReset())

  it('exchanges the token once for every client until the credentials near expiry', async () => {
    let now = 0
    exchange.mockResolvedValue(creds(3_600_000))
    const provider = roleCredentials(ROLE, 'ap-northeast-2', () => now)
    expect(roleCredentials(ROLE, 'ap-northeast-2')).toBe(provider)
    await provider()
    await provider()
    expect(exchange).toHaveBeenCalledTimes(1)
    now = 3_600_000 - 60_000
    await provider()
    expect(exchange).toHaveBeenCalledTimes(2)
  })

  it('does not keep a failed exchange', async () => {
    exchange.mockRejectedValueOnce(new Error('AccessDenied')).mockResolvedValue(creds(Number.MAX_SAFE_INTEGER))
    const provider = roleCredentials(ROLE, 'us-east-1')
    await expect(provider()).rejects.toThrow('AccessDenied')
    await expect(provider()).resolves.toMatchObject({ accessKeyId: 'AKIA' })
    expect(exchange).toHaveBeenCalledTimes(2)
  })
})
