import type { SupabaseClient } from '@supabase/supabase-js'

/** Raised by a write that finds no session. Saving needs an account; this never makes one. */
export class NoSessionError extends Error {
  constructor() {
    super('No session: sign in before saving')
    this.name = 'NoSessionError'
  }
}

/**
 * Every call that adds a row to `user_words` or `review_log` runs this first. It refuses
 * rather than signing in anonymously: an anonymous account lives in one browser's cookie
 * and is lost with it. An anonymous session that already exists still passes, so
 * `attachEmail` can keep its words.
 */
export async function ensureSession(supabase: SupabaseClient): Promise<void> {
  const { data } = await supabase.auth.getSession()
  if (!data.session) throw new NoSessionError()
}
