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

export function useAiEnabled(): boolean {
  const [enabled, setEnabled] = useState(cached ?? false)

  useEffect(() => {
    if (cached !== null) return
    inFlight ??= aiEnabled().then((v) => {
      cached = v
      inFlight = null
      return v
    })
    let live = true
    inFlight.then((v) => { if (live) setEnabled(v) }).catch(() => {})
    return () => { live = false }
  }, [])

  return enabled
}
