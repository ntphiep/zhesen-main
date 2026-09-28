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

/** A streamed task (chat) calls `onText` with the reply so far as it is written. The
 *  text is unchecked until the outcome arrives; only the outcome is the answer. */
export async function callAi<K extends TaskName>(
  task: K,
  input: z.input<Tasks[K]['input']>,
  signal?: AbortSignal,
  onText?: (text: string) => void,
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

  const body: unknown = res.ok && res.body && res.headers.get('content-type')?.startsWith('application/x-ndjson')
    ? await readLines(res.body, onText)
    : await res.json().catch(() => null)
  const message = (body as { error?: unknown } | null)?.error
  if (!res.ok || typeof message === 'string') {
    return { status: 'error', message: typeof message === 'string' ? message : 'Trợ lý chưa trả lời được.' }
  }

  // Loaded here rather than at module scope: by now the request has been made
  // and the chunk downloads alongside it.
  const { TASKS } = await import('./tasks')
  const parsed = TASKS[task].output.safeParse((body as { data?: unknown } | null)?.data)
  if (!parsed.success) return { status: 'error', message: 'Chưa đọc được câu trả lời.' }
  return { status: 'ok', data: parsed.data as Output<K> }
}

/** Reads `app/api/ai/route.ts`'s NDJSON: every `{"text"}` line goes to `onText` as the
 *  text so far, and the closing `{"data"}` or `{"error"}` line is returned. A body cut
 *  before that line returns null, and an abort is rethrown for the caller to ignore. */
async function readLines(body: ReadableStream<Uint8Array>, onText?: (text: string) => void): Promise<unknown> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffered = ''
  let text = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return null
      buffered += decoder.decode(value, { stream: true })
      const lines = buffered.split('\n')
      buffered = lines.pop() ?? ''
      for (const line of lines.filter(Boolean)) {
        const msg: unknown = JSON.parse(line)
        const piece = (msg as { text?: unknown } | null)?.text
        if (typeof piece !== 'string') return msg
        text += piece
        onText?.(text)
      }
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    return { error: 'Chưa kết nối được trợ lý.' }
  } finally {
    reader.cancel().catch(() => {})
  }
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
