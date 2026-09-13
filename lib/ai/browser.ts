'use client'
import type { z } from 'zod'
import { TASKS, type TaskName } from './tasks'

/**
 * Calling the assistant from a component.
 *
 * Mirrors `lib/dictionary/searchClient.ts`: a refusal is an outcome the caller
 * renders, not an exception it has to catch. The distinction matters here --
 * "trợ lý chưa bật" and "trợ lý trả lời sai" want different words on screen, and
 * neither is the same as the answer being empty.
 */
export type AiOutcome<T> =
  | { status: 'ok'; data: T }
  | { status: 'error'; message: string }

type Output<K extends TaskName> = z.infer<(typeof TASKS)[K]['output']>

export async function callAi<K extends TaskName>(
  task: K,
  input: z.input<(typeof TASKS)[K]['input']>,
  signal?: AbortSignal,
): Promise<AiOutcome<Output<K>>> {
  let res: Response
  try {
    res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task, input }),
      signal,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    return { status: 'error', message: 'Không kết nối được tới trợ lý.' }
  }

  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const message = (body as { error?: string } | null)?.error
    return { status: 'error', message: message ?? 'Trợ lý gặp lỗi.' }
  }

  const parsed = TASKS[task].output.safeParse((body as { data?: unknown } | null)?.data)
  if (!parsed.success) return { status: 'error', message: 'Trợ lý trả về dữ liệu lạ.' }
  return { status: 'ok', data: parsed.data as Output<K> }
}

/** Whether the deployment has the assistant configured at all. */
export async function aiEnabled(signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch('/api/ai', { signal })
    if (!res.ok) return false
    return (await res.json())?.enabled === true
  } catch {
    return false
  }
}
