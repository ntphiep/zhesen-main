/** A body that arrives in `size`-byte pieces, as it does off the wire: an event or a
 *  line spans chunks, and so does a multi-byte Vietnamese character. */
export function chunked(text: string, size = 7): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text)
  return new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += size) controller.enqueue(bytes.slice(i, i + size))
      controller.close()
    },
  })
}

type StreamEvent = { type: string; [key: string]: unknown }

/** The model streaming `pieces` as Anthropic-style server-sent events, optionally
 *  followed by other events (an `error`, say) instead of a clean stop. */
export function anthropicStream(pieces: string[], tail: StreamEvent[] = [{ type: 'message_stop' }]): Response {
  const events: StreamEvent[] = [
    { type: 'message_start', message: { id: 'm', type: 'message', role: 'assistant', content: [] } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'ping' },
    ...pieces.map((text) => ({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })),
    ...tail,
  ]
  const body = events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('')
  return new Response(chunked(body), { headers: { 'content-type': 'text/event-stream; charset=utf-8' } })
}

/** Every NDJSON line of a streamed `/api/ai` answer, parsed. */
export async function ndjsonLines(res: Response): Promise<unknown[]> {
  return (await res.text()).split('\n').filter(Boolean).map((l) => JSON.parse(l))
}
