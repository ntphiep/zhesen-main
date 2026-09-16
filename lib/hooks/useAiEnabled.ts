'use client'
import { useEffect, useState } from 'react'
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
  const [enabled, setEnabled] = useState(known ?? cached ?? false)

  useEffect(() => {
    if (known !== undefined) { cached = known; return }
    if (cached !== null) return
    inFlight ??= aiEnabled().then((v) => {
      cached = v
      inFlight = null
      return v
    })
    let live = true
    inFlight.then((v) => { if (live) setEnabled(v) }).catch(() => {})
    return () => { live = false }
  }, [known])

  return known ?? enabled
}
