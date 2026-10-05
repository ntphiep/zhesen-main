import { describe, it, expect, vi, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { queryBuilder } from './helpers/supabase'
import {
  getReminder, pushConfig, refreshDevice, setReminderHour, turnOffReminder, turnOnReminder,
} from '@/lib/push/reminders'

const KEY = 'B' + 'A'.repeat(86)
const device = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: KEY, auth: 'A'.repeat(22) }

/** A client recording each table call and the RPC, with one error per step when asked. */
function client(errors: { upsert?: unknown; rpc?: unknown; deleteSubs?: unknown; deleteReminder?: unknown; select?: unknown } = {}, row: unknown = null) {
  const steps: string[] = []
  const upsert = vi.fn(async () => { steps.push('upsert'); return { error: errors.upsert ?? null } })
  const deletes: Record<string, ReturnType<typeof vi.fn>> = {}
  const from = vi.fn((table: string) => {
    const deleteEq = vi.fn(async () => {
      steps.push(`delete ${table}`)
      return { error: (table === 'push_subscriptions' ? errors.deleteSubs : errors.deleteReminder) ?? null }
    })
    deletes[table] = deleteEq
    return {
      ...queryBuilder({ data: row, error: errors.select ?? null }),
      upsert,
      delete: vi.fn(() => ({ eq: deleteEq })),
    }
  })
  const rpc = vi.fn(async () => { steps.push('rpc'); return { data: 'id', error: errors.rpc ?? null } })
  return { supabase: { from, rpc } as unknown as SupabaseClient, from, rpc, upsert, deletes, steps }
}

afterEach(() => { vi.unstubAllEnvs() })

describe('pushConfig', () => {
  it('is null without a key, as aiConfig is without a model', () => {
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', '')
    expect(pushConfig()).toBeNull()
  })

  it('is null for a value that is not a P-256 public key', () => {
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'not-a-key')
    expect(pushConfig()).toBeNull()
  })

  it('hands over the key', () => {
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', ` ${KEY}\n`)
    expect(pushConfig()).toEqual({ publicKey: KEY })
  })
})

describe('getReminder', () => {
  it('maps the row to camelCase', async () => {
    const { supabase, from } = client({}, { hour: 21, time_zone: 'Asia/Ho_Chi_Minh' })
    expect(await getReminder(supabase, 'u1')).toEqual({ hour: 21, timeZone: 'Asia/Ho_Chi_Minh' })
    expect(from).toHaveBeenCalledWith('reminders')
  })

  it('is null when the reminder is off', async () => {
    expect(await getReminder(client({}, null).supabase, 'u1')).toBeNull()
  })

  it('is null when the read fails', async () => {
    expect(await getReminder(client({ select: { message: 'boom' } }).supabase, 'u1')).toBeNull()
  })

  it('refuses an hour outside 6 to 22', async () => {
    await expect(getReminder(client({}, { hour: 23, time_zone: 'UTC' }).supabase, 'u1')).rejects.toThrow()
  })
})

describe('turnOnReminder', () => {
  it('saves the hour and zone, then registers the browser', async () => {
    const { supabase, upsert, rpc, steps } = client()
    expect(await turnOnReminder(supabase, device, 20, 'Asia/Ho_Chi_Minh')).toEqual({ ok: true })
    expect(upsert).toHaveBeenCalledWith({ hour: 20, time_zone: 'Asia/Ho_Chi_Minh' }, { onConflict: 'user_id' })
    expect(rpc).toHaveBeenCalledWith('push_subscribe', { p_endpoint: device.endpoint, p_p256dh: KEY, p_auth: device.auth })
    expect(steps).toEqual(['upsert', 'rpc'])
  })

  it('refuses an endpoint that is not https before any call', async () => {
    const { supabase, from, rpc } = client()
    const outcome = await turnOnReminder(supabase, { ...device, endpoint: 'http://fcm.googleapis.com/x' }, 20, 'UTC')
    expect(outcome).toEqual({ ok: false, message: 'Chưa bật được nhắc. Thử lại.' })
    expect(from).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('stops when the hour cannot be saved', async () => {
    const { supabase, rpc } = client({ upsert: { code: '42501' } })
    expect(await turnOnReminder(supabase, device, 20, 'UTC')).toEqual({ ok: false, message: 'Chưa bật được nhắc. Thử lại.' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('fails when the browser cannot be registered', async () => {
    const { supabase } = client({ rpc: { code: '42501' } })
    expect(await turnOnReminder(supabase, device, 20, 'UTC')).toEqual({ ok: false, message: 'Chưa bật được nhắc. Thử lại.' })
  })
})

describe('refreshDevice', () => {
  it('registers the keys again', async () => {
    const { supabase, rpc } = client()
    expect(await refreshDevice(supabase, device)).toBe(true)
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('refuses an endpoint that is not https', async () => {
    const { supabase, rpc } = client()
    expect(await refreshDevice(supabase, { ...device, endpoint: 'ftp://x' })).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('setReminderHour', () => {
  it('saves the new hour with the zone', async () => {
    const { supabase, upsert } = client()
    expect(await setReminderHour(supabase, 7, 'Europe/Madrid')).toEqual({ ok: true })
    expect(upsert).toHaveBeenCalledWith({ hour: 7, time_zone: 'Europe/Madrid' }, { onConflict: 'user_id' })
  })

  it('says when it could not save', async () => {
    expect(await setReminderHour(client({ upsert: { code: '500' } }).supabase, 7, 'UTC'))
      .toEqual({ ok: false, message: 'Chưa lưu được giờ nhắc. Thử lại.' })
  })
})

describe('turnOffReminder', () => {
  it('deletes every browser of the account and the reminder', async () => {
    const { supabase, deletes, steps } = client()
    expect(await turnOffReminder(supabase, 'u1')).toEqual({ ok: true })
    expect(steps).toEqual(['delete push_subscriptions', 'delete reminders'])
    expect(deletes.push_subscriptions).toHaveBeenCalledWith('user_id', 'u1')
    expect(deletes.reminders).toHaveBeenCalledWith('user_id', 'u1')
  })

  it('keeps the reminder when the browsers could not be deleted', async () => {
    const { supabase, steps } = client({ deleteSubs: { code: '500' } })
    expect(await turnOffReminder(supabase, 'u1')).toEqual({ ok: false, message: 'Chưa tắt được nhắc. Thử lại.' })
    expect(steps).toEqual(['delete push_subscriptions'])
  })

  it('says when the reminder could not be deleted', async () => {
    expect(await turnOffReminder(client({ deleteReminder: { code: '500' } }).supabase, 'u1'))
      .toEqual({ ok: false, message: 'Chưa tắt được nhắc. Thử lại.' })
  })
})
