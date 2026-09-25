/** Answers shared by the handlers under app/api/admin/. */

export function notFoundJson(): Response {
  return Response.json({ error: 'Không tìm thấy.' }, { status: 404 })
}

export function badRequest(): Response {
  return Response.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 400 })
}

/**
 * An `admin.*` function refuses with errcode 22023 and a short reason as the message
 * (supabase/migrations/0059_admin_account_actions.sql), which `refusals` puts into words.
 * 42501 is the database gate disagreeing with the server one, answered like it. Anything
 * else is a fault, and its Postgres text stays out of the response.
 */
export function rpcError(
  error: { code?: string; message: string },
  refusals: Record<string, string>,
): Response {
  if (error.code === '42501') return notFoundJson()
  if (error.code === '22023') {
    return Response.json({ error: refusals[error.message] ?? 'Thao tác bị từ chối.' }, { status: 409 })
  }
  return Response.json({ error: 'Database server gặp lỗi.' }, { status: 502 })
}

/** The body as JSON, or undefined when it is not JSON. The content-type check keeps a
 *  cross-site form post, which cannot send application/json, from reaching a write. */
export async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) return undefined
  try {
    return await request.json()
  } catch {
    return undefined
  }
}
