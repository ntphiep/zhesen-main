import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from '@/lib/zod'
import type { SaveOutcome } from '@/lib/auth/profile'

/**
 * The daily review reminder (issue #91): `public.reminders` holds the hour, and
 * `public.push_subscriptions` one row per browser, both under RLS (migration 0141). The push
 * itself comes from the job in infra/supabase/push, which reads them as service_role.
 */

/** Local hours a reminder may be set to; nothing is sent from 23:00 to 05:59. */
export const REMINDER_HOURS = { first: 6, last: 22, fallback: 20 } as const

export interface Reminder {
  hour: number
  timeZone: string
}

/** What a browser's push subscription hands the sender, base64url without padding. */
export interface DeviceKeys {
  endpoint: string
  p256dh: string
  auth: string
}

const B64U_POINT = /^[A-Za-z0-9_-]{87}$/

/** The VAPID public key browsers subscribe with. Null is a supported state, like `aiConfig()`:
 *  a deployment without the key shows no reminder panel. */
export function pushConfig(): { publicKey: string } | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()
  return publicKey && B64U_POINT.test(publicKey) ? { publicKey } : null
}

const reminderRow = z.object({
  hour: z.number().int().min(REMINDER_HOURS.first).max(REMINDER_HOURS.last),
  time_zone: z.string(),
})

/** The account's reminder, or null when it is off. */
export async function getReminder(supabase: SupabaseClient, userId: string): Promise<Reminder | null> {
  const { data, error } = await supabase
    .from('reminders')
    .select('hour, time_zone')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) return null
  const row = reminderRow.parse(data)
  return { hour: row.hour, timeZone: row.time_zone }
}

export const TURN_ON_FAILED = 'Chưa bật được nhắc. Thử lại.'

async function saveHour(supabase: SupabaseClient, hour: number, timeZone: string) {
  const { error } = await supabase
    .from('reminders')
    .upsert({ hour, time_zone: timeZone }, { onConflict: 'user_id' })
  return error
}

async function registerDevice(supabase: SupabaseClient, device: DeviceKeys) {
  const { error } = await supabase.rpc('push_subscribe', {
    p_endpoint: device.endpoint, p_p256dh: device.p256dh, p_auth: device.auth,
  })
  return error
}

/** Turn the reminder on for this browser, at `hour` in `timeZone`. */
export async function turnOnReminder(
  supabase: SupabaseClient, device: DeviceKeys, hour: number, timeZone: string,
): Promise<SaveOutcome> {
  // The sender POSTs to the endpoint, and the database refuses anything else anyway.
  if (!device.endpoint.startsWith('https://')) return { ok: false, message: TURN_ON_FAILED }
  if (await saveHour(supabase, hour, timeZone)) return { ok: false, message: TURN_ON_FAILED }
  if (await registerDevice(supabase, device)) return { ok: false, message: TURN_ON_FAILED }
  return { ok: true }
}

/** Store this browser's keys again: a browser may rotate them without telling the page. */
export async function refreshDevice(supabase: SupabaseClient, device: DeviceKeys): Promise<boolean> {
  if (!device.endpoint.startsWith('https://')) return false
  return !(await registerDevice(supabase, device))
}

export async function setReminderHour(
  supabase: SupabaseClient, hour: number, timeZone: string,
): Promise<SaveOutcome> {
  return (await saveHour(supabase, hour, timeZone))
    ? { ok: false, message: 'Chưa lưu được giờ nhắc. Thử lại.' }
    : { ok: true }
}

/** Off everywhere: the reminder and every browser the account registered. */
export async function turnOffReminder(supabase: SupabaseClient, userId: string): Promise<SaveOutcome> {
  const failed: SaveOutcome = { ok: false, message: 'Chưa tắt được nhắc. Thử lại.' }
  const { error: devices } = await supabase.from('push_subscriptions').delete().eq('user_id', userId)
  if (devices) return failed
  const { error: reminder } = await supabase.from('reminders').delete().eq('user_id', userId)
  return reminder ? failed : { ok: true }
}
