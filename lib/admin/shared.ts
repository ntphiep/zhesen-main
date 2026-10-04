/**
 * One read shared by every request on this server instance for `ttlMs`. Requests that
 * arrive while it runs wait on the same promise rather than start the same full-table scan
 * again: three of them at once ran past the 8 s `statement_timeout` of `authenticated`
 * and failed with 57014. A failed read is dropped, so the next request retries.
 *
 * Admin pages only. The value is the same for every admin, and each caller has passed
 * `requireAdmin` before it asks.
 */
export interface Shared<T> {
  /** The value and when its read started, reading through `load` when none is fresh. */
  (load: () => Promise<T>, now?: number): Promise<{ value: T; at: Date }>
  /** Forget the value, after an action on this instance changed it. */
  clear(): void
}

export function shared<T>(ttlMs: number): Shared<T> {
  let entry: { at: number; value: Promise<T> } | null = null
  const read = (load: () => Promise<T>, now: number = Date.now()) => {
    if (!entry || now - entry.at >= ttlMs) {
      const mine = { at: now, value: load() }
      entry = mine
      mine.value.catch(() => {
        if (entry === mine) entry = null
      })
    }
    const { at, value } = entry
    return value.then((v) => ({ value: v, at: new Date(at) }))
  }
  return Object.assign(read, { clear: () => { entry = null } })
}
