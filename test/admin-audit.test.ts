import { describe, it, expect, vi } from 'vitest'
import { listAudit, parseAuditRow } from '@/lib/admin/audit'
import { clientReturning } from './helpers/supabase'

/** The row `admin.merge_account` wrote in a rolled-back run on production. */
const MERGE_ROW = {
  id: 4,
  at: '2026-09-23T02:12:47.562238+00:00',
  actor: 'bcfc744d-d41b-443b-b0e3-5556ac0cb1fb',
  action: 'merge_account',
  target: 'bcfc744d-d41b-443b-b0e3-5556ac0cb1fb',
  detail: {
    from: 'f5849087-73c3-4196-8aa0-491f7506c07b',
    into: 'bcfc744d-d41b-443b-b0e3-5556ac0cb1fb',
    moved: 410, kept: 0, days: 3,
  },
}

describe('parseAuditRow', () => {
  it('keeps both account ids a merge names', () => {
    const e = parseAuditRow(MERGE_ROW)
    expect(e.detail.from).toBe('f5849087-73c3-4196-8aa0-491f7506c07b')
    expect(e.detail.into).toBe('bcfc744d-d41b-443b-b0e3-5556ac0cb1fb')
  })

  it('accepts a row whose actor account has since been deleted', () => {
    expect(parseAuditRow({ ...MERGE_ROW, actor: null, target: null }).actor).toBeNull()
  })
})

describe('listAudit', () => {
  it('reads newest first, capped', async () => {
    const order = vi.fn()
    const limit = vi.fn()
    const { client, builder, from } = clientReturning([MERGE_ROW])
    Object.assign(builder, {
      order: order.mockImplementation(() => builder),
      limit: limit.mockImplementation(() => builder),
    })

    await expect(listAudit(client, 5)).resolves.toHaveLength(1)
    expect(from).toHaveBeenCalledWith('admin_audit')
    expect(order).toHaveBeenCalledWith('at', { ascending: false })
    expect(limit).toHaveBeenCalledWith(5)
  })

  it('throws a failed read rather than showing an empty log', async () => {
    const { client } = clientReturning(null, { message: 'boom' })
    await expect(listAudit(client)).rejects.toMatchObject({ message: 'boom' })
  })
})
