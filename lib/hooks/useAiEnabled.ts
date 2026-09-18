'use client'
import { useEffect, useSyncExternalStore } from 'react'
import { aiEnabled } from '@/lib/ai/browser'

/**
 * Whether to offer the assistant at all: a property of the deployment, so it is asked once
 * per tab and shared. Starts at `false` so a deployment with no model never flashes a
 * button. The shared request must not be abortable -- one unmounting component would
 * cancel the answer the others are waiting for.
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

/** What hydration renders, and why the hook reads through `useSyncExternalStore` rather
 *  than `useState`: `cached` is module state a component mounted earlier may already have
 *  filled, and under a Suspense boundary reading it as initial state threw React #418. */
function serverSnapshot(): boolean {
  return false
}

/** Forget the cached answer. For tests, which reuse the module. */
export function resetAiEnabledCache(): void {
  cached = null
  inFlight = null
}

/** `known` is the answer the server already has, since `aiConfig()` reads only environment
 *  variables. Passing it seeds the shared cache, so callers with no argument stop asking. */
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
