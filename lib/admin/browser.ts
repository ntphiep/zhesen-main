'use client'
import { z } from '@/lib/zod'

const errorBody = z.object({ error: z.string(), reauth: z.literal(true).optional() })

export type AdminOutcome =
  | { ok: true; data: unknown }
  | { ok: false; message: string; reauth?: true }

/** A POST to one of the handlers under app/api/admin/. A refusal is an outcome the caller
 *  shows, as in lib/ai/browser.ts, not an exception. */
export async function postAdmin(path: string, body?: unknown): Promise<AdminOutcome> {
  let res: Response
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    return { ok: false, message: 'Không kết nối được tới máy chủ.' }
  }
  const data: unknown = await res.json().catch(() => null)
  if (res.ok) return { ok: true, data }
  const refusal = errorBody.safeParse(data)
  if (!refusal.success) return { ok: false, message: 'Thao tác không thành công.' }
  return { ok: false, message: refusal.data.error, ...(refusal.data.reauth ? { reauth: true as const } : {}) }
}
