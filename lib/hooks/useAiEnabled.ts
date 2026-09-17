'use client'
import { useEffect, useSyncExternalStore } from 'react'
import { aiEnabled } from '@/lib/ai/browser'

/**
 * Whether to offer the assistant at all.
 *
 * The answer is a property of the deployment, not of the user or the page, so it
 * is asked once per tab and shared by every component that needs it. Starting at
 * `false` means a deployment with no model configured never flashes a button that
 * would only fail.
 *
 * The shared request is deliberately not abortable: one unmounting component must
 * not cancel the answer the others are still waiting for, and the request is a
 * single boolean.
 */
let cached: boolean | null = null
let inFlight: Promise<boolean> | null = null
const listeners = new Set<() => void>()

function publish(value: boolean): void {
  cached = value
  for (const notify of [...listeners]) notify()
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify)
  return () => { listeners.delete(notify) }
}

function snapshot(): boolean {
  return cached ?? false
}

/**
 * What hydration renders, and the reason this hook reads through
 * `useSyncExternalStore` rather than holding the answer in `useState`.
 *
 * `cached` is module state, so by the time a component hydrates, another one
 * mounted earlier has usually already filled it in. Reading it as the initial
 * state agreed with the server only while the whole page hydrated in one pass.
 * Put a Suspense boundary on a route -- which is what a `loading.tsx` does --
 * and the page below it hydrates after the layout's effects have run: `AiCoach`
 * then rendered its button on the client against a server render of nothing, and
 * React threw #418 on every dictionary entry. React hydrates this with the
 * server's snapshot and re-renders with the real one immediately afterwards,
 * which is the whole purpose of the third argument.
 */
function serverSnapshot(): boolean {
  return false
}

/** Forget the cached answer. For tests, which reuse the module. */
export function resetAiEnabledCache(): void {
  cached = null
  inFlight = null
}

/**
 * `known` is the answer the server already has: `aiConfig()` reads environment
 * variables only, so the root layout can pass it down and spare every page load a
 * request for one boolean. Passing it also seeds the shared cache, so the three
 * components that call this hook without an argument stop asking too.
 */
export function useAiEnabled(known?: boolean): boolean {
  const shared = useSyncExternalStore(subscribe, snapshot, serverSnapshot)

  useEffect(() => {
    if (known !== undefined) {
      if (cached !== known) publish(known)
      return
    }
    if (cached !== null) return
    inFlight ??= aiEnabled().then((v) => {
      inFlight = null
      publish(v)
      return v
    })
    void inFlight.catch(() => {})
  }, [known])

  return known ?? shared
}
