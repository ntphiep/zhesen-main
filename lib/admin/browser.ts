'use client'
import { z } from '@/lib/zod'

const errorBody = z.object({ error: z.string() })

export type AdminOutcome =
  | { ok: true; data: unknown }
  | { ok: false; message: string }

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
  return { ok: false, message: refusal.success ? refusal.data.error : 'Thao tác không thành công.' }
}
