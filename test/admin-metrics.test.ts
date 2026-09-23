import { describe, it, expect } from 'vitest'
import { formatBytes, getMetrics, parseMetrics, rowsOf } from '@/lib/admin/metrics'
import { rpcClientReturning } from './helpers/supabase'
import { METRICS_PAYLOAD } from './helpers/admin'

describe('parseMetrics', () => {
  it('converts to camelCase and labels the size no table owns as PGroonga', () => {
    const m = parseMetrics(METRICS_PAYLOAD)
    expect(m.databaseBytes).toBe(472063123)
    expect(m.pgroongaBytes).toBe(472063123 - 301293568)
    expect(m.accounts).toEqual({ total: 7, permanent: 5, anonymous: 2 })
    expect(m.lexUpdatedAt).toBe('2026-09-12T07:22:39.815249+00:00')
  })

  it('never reports a negative PGroonga size', () => {
    const m = parseMetrics({ ...METRICS_PAYLOAD, relation_bytes: METRICS_PAYLOAD.database_bytes + 1 })
    expect(m.pgroongaBytes).toBe(0)
  })

  it('refuses a payload missing a field rather than showing a blank number', () => {
    expect(() => parseMetrics({ ...METRICS_PAYLOAD, accounts: undefined })).toThrow()
  })
})

describe('getMetrics', () => {
  it('calls admin.metrics through the admin schema', async () => {
    const { client, rpc } = rpcClientReturning(METRICS_PAYLOAD)
    await getMetrics(client)
    expect(client.schema).toHaveBeenCalledWith('admin')
    expect(rpc).toHaveBeenCalledWith('metrics')
  })

  it('throws the database refusal instead of rendering empty numbers', async () => {
    const { client } = rpcClientReturning(null, { code: '42501', message: 'admin only' })
    await expect(getMetrics(client)).rejects.toMatchObject({ code: '42501' })
  })
})

describe('rowsOf and formatBytes', () => {
  it('finds a table by schema and name', () => {
    const m = parseMetrics(METRICS_PAYLOAD)
    expect(rowsOf(m, 'lex', 'entries')).toBe(36361)
    expect(rowsOf(m, 'lex', 'missing')).toBeNull()
  })

  it('prints binary units', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(472063123)).toBe('450 MB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})
