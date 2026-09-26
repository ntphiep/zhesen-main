'use client'
import { useEffect, useSyncExternalStore } from 'react'
import { aiEnabled } from '@/lib/ai/browser'
import { loadSupabaseClient } from '@/lib/supabase/loadClient'

/**
 * Whether to offer the assistant: the server says yes only to a permanent account on a
 * deployment with a model, so it is asked once per tab and per account, and shared.
 * Starts at `false` so nobody else ever sees a button flash. The shared request must not
 * be abortable -- one unmounting component would cancel the answer the others are
 * waiting for.
 */
let cached: boolean | null = null
let inFlight: Promise<boolean> | null = null
/** Bumped when the account changes, so an answer asked for the previous one is dropped. */
let generation = 0
let watching = false
const listeners = new Set<() => void>()

function publish(value: boolean): void {
  cached = value
  for (const notify of [...listeners]) notify()
}

function ask(): void {
  const asked = generation
  inFlight ??= aiEnabled().then((v) => {
    if (asked !== generation) return v
    inFlight = null
    publish(v)
    return v
  })
  void inFlight.catch(() => {})
}

/** Sign-in and sign-out navigate on the client, so this module outlives them. The same
 *  subscription `useAccount` uses; the first callback only records who is signed in. */
function watchAccount(): void {
  if (watching) return
  watching = true
  let seen: string | undefined
  void loadSupabaseClient().then(({ createClient }) => {
    createClient().auth.onAuthStateChange((_event, session) => {
      const who = session?.user ? `${session.user.id}:${session.user.email ?? ''}` : ''
      if (seen !== undefined && who !== seen) {
        generation++
        inFlight = null
        cached = null
        if (listeners.size > 0) ask()
      }
      seen = who
    })
  }).catch(() => {})
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
  generation++
  cached = null
  inFlight = null
}

/** `known` is an answer the caller already has. Passing it seeds the shared cache, so
 *  callers with no argument stop asking. */
export function useAiEnabled(known?: boolean): boolean {
  const shared = useSyncExternalStore(subscribe, snapshot, serverSnapshot)

  useEffect(() => {
    if (known !== undefined) {
      if (cached !== known) publish(known)
      return
    }
    watchAccount()
    if (cached === null) ask()
  }, [known])

  return known ?? shared
}
