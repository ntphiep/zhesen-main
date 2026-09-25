'use client'
import type { z } from 'zod'
import type { TaskName } from './tasks'

// Type-only: a value import pulls all of zod into the chunk every route loads, because
// AiChatPanel sits in the root layout -- 63.1 kB gzipped on pages with no assistant.
type Tasks = typeof import('./tasks')['TASKS']

/** Calling the assistant from a component. As in `lib/dictionary/searchClient.ts`, a
 *  refusal is an outcome the caller renders, not an exception: "not enabled", "wrong
 *  answer" and "empty answer" each need different words on screen. */
export type AiOutcome<T> =
  | { status: 'ok'; data: T }
  | { status: 'error'; message: string }

type Output<K extends TaskName> = z.infer<Tasks[K]['output']>

export async function callAi<K extends TaskName>(
  task: K,
  input: z.input<Tasks[K]['input']>,
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
    return { status: 'error', message: 'Chưa kết nối được trợ lý.' }
  }

  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const message = (body as { error?: string } | null)?.error
    return { status: 'error', message: message ?? 'Trợ lý chưa trả lời được.' }
  }

  // Loaded here rather than at module scope: by now the request has been made
  // and the chunk downloads alongside it.
  const { TASKS } = await import('./tasks')
  const parsed = TASKS[task].output.safeParse((body as { data?: unknown } | null)?.data)
  if (!parsed.success) return { status: 'error', message: 'Chưa đọc được câu trả lời.' }
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
