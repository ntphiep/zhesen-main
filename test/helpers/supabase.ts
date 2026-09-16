import { vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface QueryResult {
  data: unknown
  error: unknown
}

/** PostgREST builder methods that return the builder again. Listed rather than
 * matched by a proxy on purpose: a call to a method that does not exist should
 * still fail the test instead of chaining happily. */
const CHAINING = [
  'select', 'eq', 'neq', 'in', 'is', 'not', 'lte', 'gte', 'lt', 'gt',
  'ilike', 'like', 'filter', 'order', 'limit', 'range', 'maybeSingle', 'single',
] as const

/**
 * A query builder that chains through the PostgREST methods and resolves to
 * `result` when awaited, whichever method ends the chain -- `.limit()`,
 * `.maybeSingle()`, or the builder itself.
 *
 * Pass `overrides` to replace one method with your own spy, which is how a test
 * asserts on the arguments the code under test passed (`range`, `limit`,
 * `filter`) or returns different rows per branch.
 */
export function queryBuilder(result: QueryResult, overrides: Record<string, unknown> = {}) {
  const builder: Record<string, unknown> = {
    then: (resolve: (value: QueryResult) => unknown) => Promise.resolve(result).then(resolve),
  }
  for (const method of CHAINING) builder[method] = vi.fn(() => builder)
  Object.assign(builder, overrides)
  return builder
}

/**
 * A client whose `.from()` and `.schema(...).from()` both hand back one builder.
 * Covers the common case: a query whose result the test supplies and whose exact
 * chain it does not care about.
 */
export function clientReturning(data: unknown, error: unknown = null, overrides?: Record<string, unknown>) {
  const builder = queryBuilder({ data, error }, overrides)
  const from = vi.fn(() => builder)
  const client = {
    from,
    schema: vi.fn(() => ({ from })),
  } as unknown as SupabaseClient
  return { client, builder, from }
}

/** A client whose `.schema(...).rpc()` returns one payload. */
export function rpcClientReturning(data: unknown, error: unknown = null) {
  const rpc = vi.fn(async () => ({ data, error }))
  const client = { schema: vi.fn(() => ({ rpc })), rpc } as unknown as SupabaseClient
  return { client, rpc }
}

/**
 * The auth half of a client. `session` is what getSession reports: an object to
 * act as a signed-in user, null to make ensureSession create an account.
 */
export function authStub(
  session: unknown,
  signInAnonymously: () => Promise<{ error: unknown }> = vi.fn(async () => ({ error: null })),
) {
  return {
    auth: {
      getSession: vi.fn(async () => ({ data: { session } })),
      signInAnonymously,
    },
    signInAnonymously,
  }
}

/**
 * The auth half `useAccount` reads: getUser resolves to `user` (with an email
 * for a signed-in account, without for the legacy anonymous one, or null for a
 * visitor) and the state subscription never fires, so the kind settles once.
 */
export function accountAuthStub(user: { id: string; email?: string } | null) {
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: () => {} } } })),
    },
  }
}
