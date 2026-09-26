/**
 * The one dynamic import of the browser client. Pages load supabase-js only when they need
 * it, and every caller awaits this same promise. Separate `import()` calls racing for the
 * module let Vitest 5.0.1 hand the real module to all but the first while an async
 * `vi.mock` factory is still pending, and the real client throws without env in CI.
 */
let pending: Promise<typeof import('./client')> | null = null

export function loadSupabaseClient(): Promise<typeof import('./client')> {
  return (pending ??= import('./client'))
}
