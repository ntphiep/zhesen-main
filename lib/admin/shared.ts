/**
 * One read shared by every request on this server instance for `ttlMs`. Requests that
 * arrive while it runs wait on the same promise rather than start the same full-table scan
 * again: three of them at once ran past the 8 s `statement_timeout` of `authenticated`
 * and failed with 57014. A failed read is dropped, so the next request retries.
 *
 * Admin pages only. The value is the same for every admin, and each caller has passed
 * `requireAdmin` before it asks.
 */
export type Shared<T> = (load: () => Promise<T>, now?: number) => Promise<{ value: T; at: Date }>

/** admin.metrics() for the overview and admin.dictionary() for /admin/database. */
export type SharedName = 'metrics' | 'dictionary'

/** Route handlers and pages load through separate module runtimes, each with its own module
 *  cache, so a clear from a route reaches a page's read only through `globalThis`. */
const store: typeof globalThis & { zhesenAdminShared?: Map<SharedName, number> } = globalThis

function generation(name: SharedName): number {
  return store.zhesenAdminShared?.get(name) ?? 0
}

/** Make the next read of `name` start afresh, in every module copy on this instance. */
export function clearShared(name: SharedName): void {
  const generations = (store.zhesenAdminShared ??= new Map())
  generations.set(name, generation(name) + 1)
}

export function shared<T>(name: SharedName, ttlMs: number): Shared<T> {
  let entry: { at: number; generation: number; value: Promise<T> } | null = null
  return (load, now = Date.now()) => {
    const current = generation(name)
    if (!entry || entry.generation !== current || now - entry.at >= ttlMs) {
      const mine = { at: now, generation: current, value: load() }
      entry = mine
      mine.value.catch(() => {
        if (entry === mine) entry = null
      })
    }
    const { at, value } = entry
    return value.then((v) => ({ value: v, at: new Date(at) }))
  }
}
